-- RapidAid Database Schema
-- This script is idempotent: it can be run multiple times safely.

-- Enable necessary extensions
create extension if not exists "postgis";

-- 1. Profiles Table (extends auth.users)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        create type user_role as enum ('driver');
    END IF;
END $$;

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role user_role not null default 'driver',
  full_name text not null,
  phone text,
  latitude float8,
  longitude float8,
  is_available boolean default false,
  updated_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

-- Drop existing policies to avoid conflicts when re-running
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;

create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- 2. Emergency Requests Table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
        create type request_status as enum ('pending', 'assigned', 'accepted', 'resolved');
    END IF;
END $$;

-- Safety check to ensure 'assigned' exists in the enum if it was created previously
DO $$
BEGIN
    BEGIN
        ALTER TYPE public.request_status ADD VALUE 'assigned' AFTER 'pending';
    EXCEPTION
        WHEN duplicate_object THEN null;
    END;
END $$;

create table if not exists public.emergency_requests (
  id uuid default gen_random_uuid() primary key,
  requester_name text,
  requester_phone text,
  latitude float8 not null,
  longitude float8 not null,
  driver_id uuid references public.profiles(id),
  status request_status default 'pending',
  type text default 'medical',
  image_url text,
  crash_verified boolean default false,
  severity integer,
  created_at timestamp with time zone default now(),
  accepted_at timestamp with time zone,
  resolved_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);

-- Ensure columns exist if table was already created
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emergency_requests' AND column_name='accepted_at') THEN
        ALTER TABLE public.emergency_requests ADD COLUMN accepted_at timestamp with time zone;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emergency_requests' AND column_name='resolved_at') THEN
        ALTER TABLE public.emergency_requests ADD COLUMN resolved_at timestamp with time zone;
    END IF;
END $$;

alter table public.emergency_requests enable row level security;

drop policy if exists "Anyone can insert emergency requests" on public.emergency_requests;
drop policy if exists "Anyone can read emergency requests" on public.emergency_requests;
drop policy if exists "Drivers can update emergency requests" on public.emergency_requests;

create policy "Anyone can insert emergency requests" on public.emergency_requests for insert with check (true);
create policy "Anyone can read emergency requests" on public.emergency_requests for select using (true);
create policy "Drivers can update emergency requests" on public.emergency_requests for update using (auth.uid() = driver_id or (driver_id IS NULL AND status = 'pending'));

-- 3. Accidents Table
create table if not exists public.accidents (
  id uuid default gen_random_uuid() primary key,
  latitude float8 not null,
  longitude float8 not null,
  severity integer not null,
  "timestamp" timestamp with time zone default now(),
  constraint unique_accident unique (latitude, longitude, "timestamp")
);

-- Ensure the constraint exists if the table already existed
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_accident') THEN
        ALTER TABLE public.accidents ADD CONSTRAINT unique_accident UNIQUE (latitude, longitude, "timestamp");
    END IF;
END $$;

alter table public.accidents enable row level security;

drop policy if exists "Anyone can read accidents" on public.accidents;
drop policy if exists "Anyone can insert accidents" on public.accidents;

create policy "Anyone can read accidents" on public.accidents for select using (true);
create policy "Anyone can insert accidents" on public.accidents for insert with check (true);

-- 4. Red Zones Table
create table if not exists public.red_zones (
  id uuid default gen_random_uuid() primary key,
  center_lat float8 not null,
  center_lon float8 not null,
  radius float8 not null,
  risk_score integer not null,
  updated_at timestamp with time zone default now()
);

alter table public.red_zones enable row level security;

drop policy if exists "Anyone can read red zones" on public.red_zones;
drop policy if exists "Anyone can insert red zones" on public.red_zones;
drop policy if exists "Anyone can delete red zones" on public.red_zones;

create policy "Anyone can read red zones" on public.red_zones for select using (true);
create policy "Anyone can insert red zones" on public.red_zones for insert with check (true);
create policy "Anyone can delete red zones" on public.red_zones for delete using (true);

-- 5. Hospitals Table
create table if not exists public.hospitals (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  location jsonb not null,
  contact text
);

alter table public.hospitals enable row level security;
drop policy if exists "Anyone can read hospitals" on public.hospitals;
create policy "Anyone can read hospitals" on public.hospitals for select using (true);

-- 6. Police Stations Table
create table if not exists public.police_stations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  location jsonb not null,
  contact text
);

alter table public.police_stations enable row level security;
drop policy if exists "Anyone can read police stations" on public.police_stations;
create policy "Anyone can read police stations" on public.police_stations for select using (true);

-- 7. Haversine Distance Function
create or replace function public.haversine_distance(lat1 float8, lon1 float8, lat2 float8, lon2 float8)
returns float8 as $$
declare
    radius float8 := 6371; 
    dlat float8;
    dlon float8;
    a float8;
    c float8;
begin
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    a := sin(dlat/2) * sin(dlat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2) * sin(dlon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    return radius * c;
end;
$$ language plpgsql immutable;


-- 8. Assign Nearest Driver Trigger
create or replace function public.assign_driver_to_request()
returns trigger as $$
declare
    closest_driver_id uuid;
begin
    select id into closest_driver_id
    from public.profiles
    where role = 'driver' and is_available = true
      and latitude is not null and longitude is not null
      and public.haversine_distance(NEW.latitude, NEW.longitude, latitude, longitude) <= 20.0
    order by public.haversine_distance(NEW.latitude, NEW.longitude, latitude, longitude) asc
    limit 1;

    if closest_driver_id is not null then
        NEW.driver_id := closest_driver_id;
        NEW.status := 'assigned';
        
        update public.profiles
        set is_available = false
        where id = closest_driver_id;
    end if;

    return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_emergency_request_created on public.emergency_requests;
create trigger on_emergency_request_created
    before insert on public.emergency_requests
    for each row
    execute function public.assign_driver_to_request();

-- 9. Auto-create Profile Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Driver Unit'),
    cast(coalesce(new.raw_user_meta_data->>'role', 'driver') as user_role)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 10. Enable Realtime
-- Realtime setup is idempotent since 'add table' won't error if already there in most cases, but we can be safe
DO $$ 
BEGIN
    begin
        alter publication supabase_realtime add table public.red_zones;
    exception when others then null; end;
    begin
        alter publication supabase_realtime add table public.emergency_requests;
    exception when others then null; end;
    begin
        alter publication supabase_realtime add table public.profiles;
    exception when others then null; end;
    begin
        alter publication supabase_realtime add table public.accidents;
    exception when others then null; end;
END $$;

-- RPC for Dashboard Stats
create or replace function get_driver_stats(id_param uuid)
returns table(trips_count bigint, avg_response_min float) as $$
begin
  return query
  select 
    count(case when status = 'resolved' and resolved_at::date = current_date then 1 end)::bigint as trips_count,
    coalesce(avg(case when accepted_at is not null and created_at::date = current_date then extract(epoch from (accepted_at - created_at)) / 60 end), 0)::float as avg_response_min
  from public.emergency_requests
  where driver_id = id_param;
end;
$$ language plpgsql security definer;
