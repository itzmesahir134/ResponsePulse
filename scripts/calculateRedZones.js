
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Haversine formula in JS
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

async function updateRedZones() {
    console.log("🔄 Starting Red Zone clustering logic...");

    // 1. Fetch all accidents
    const { data: accidents, error } = await supabase
        .from('accidents')
        .select('latitude, longitude, severity');

    if (error || !accidents) {
        console.error("❌ Failed to fetch accidents:", error?.message);
        return;
    }

    console.log(`📊 Processing ${accidents.length} accidents...`);

    const CLUSTER_RADIUS = 600; // 600m as per requirement
    const clusters = [];

    // 2. Clustering algorithm (Leader-Follower / Grid-based approach)
    for (const accident of accidents) {
        let assigned = false;

        for (const cluster of clusters) {
            const distance = calculateDistance(
                accident.latitude,
                accident.longitude,
                cluster.center_lat,
                cluster.center_lon
            );

            if (distance <= CLUSTER_RADIUS) {
                // Add to existing cluster
                cluster.points.push(accident);
                // Recompute center (weighted average or simple average)
                cluster.center_lat = (cluster.center_lat * (cluster.points.length - 1) + accident.latitude) / cluster.points.length;
                cluster.center_lon = (cluster.center_lon * (cluster.points.length - 1) + accident.longitude) / cluster.points.length;
                assigned = true;
                break;
            }
        }

        if (!assigned) {
            // Create new cluster
            clusters.push({
                center_lat: accident.latitude,
                center_lon: accident.longitude,
                points: [accident],
                radius: CLUSTER_RADIUS // Fixed or dynamic later
            });
        }
    }

    // 3. Filter clusters (e.g., only those with more than X accidents or define a risk score)
    // Requirement 1: risk_score = number of accidents in cluster.
    const redZonesData = clusters
        .filter(c => c.points.length >= 3) // Only significant clusters
        .map(c => {
            // Dynamic radius: avg distance from center + padding, capped at 1000m
            let maxDist = 0;
            for (const p of c.points) {
                const d = calculateDistance(c.center_lat, c.center_lon, p.latitude, p.longitude);
                if (d > maxDist) maxDist = d;
            }

            return {
                center_lat: c.center_lat,
                center_lon: c.center_lon,
                radius: Math.max(200, Math.min(maxDist + 50, 800)), // dynamic but sane limits
                risk_score: c.points.length,
                updated_at: new Date().toISOString()
            };
        });

    console.log(`🎯 Identified ${redZonesData.length} potential Red Zones.`);

    // 4. Update Red Zones table
    // Clear old zones first or upsert? 
    // Given we don't have unique IDs for clusters across runs, clearing is safer for simulation.
    const { error: deleteError } = await supabase
        .from('red_zones')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
        console.error("❌ Failed to clear old red zones:", deleteError.message);
    }

    const { error: insertError } = await supabase
        .from('red_zones')
        .insert(redZonesData);

    if (insertError) {
        console.error("❌ Failed to insert red zones:", insertError.message);
    } else {
        console.log("✅ Red Zones successfully updated in database.");
    }
}

// Run immediately
updateRedZones();

// Simulate periodic refresh if kept running
// setInterval(updateRedZones, 60000 * 5); // every 5 mins
