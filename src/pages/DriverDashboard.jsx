import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { supabase } from '../services/supabase'
import { useLocationTracking } from '../hooks/useLocationTracking'
import AppMap from '../components/AppMap'
import { Navigation, Target, ShieldCheck, AlertCircle, MapPin, Activity, Radar } from 'lucide-react'

// Haversine formula to calculate distance in KM
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export default function DriverDashboard() {
    const { user, profile, updateAvailability } = useAuthStore()
    const { location } = useLocationTracking(user?.id, 'driver')

    const [assignedEmergency, setAssignedEmergency] = useState(null)
    const [nearbyRequests, setNearbyRequests] = useState([])
    const [accidents, setAccidents] = useState([])
    const [redZones, setRedZones] = useState([])
    const [routeDetails, setRouteDetails] = useState(null)
    const [dashStats, setDashStats] = useState({ trips: 0, avgResponse: 0 })

    // UI Toggles
    const [showHeatmap, setShowHeatmap] = useState(true)
    const [showRedZones, setShowRedZones] = useState(true)
    const [focusMyLocation, setFocusMyLocation] = useState(true)
    const [forcedCenter, setForcedCenter] = useState(null)
    const [activeStandbyTarget, setActiveStandbyTarget] = useState(null)

    // Strategic Positioning Logic
    const positionSuggestion = useMemo(() => {
        if (!location || !redZones.length || assignedEmergency || !profile?.is_available) return null;

        const zonesWithDistance = redZones.map(zone => {
            const dist = calculateDistance(
                location.lat,
                location.lng,
                zone.center_lat,
                zone.center_lon
            );
            return { ...zone, distance: dist };
        });

        const nearbyZones = zonesWithDistance.filter(z => z.distance <= 5.0);

        if (nearbyZones.length === 0) return { type: 'none' };

        const bestZone = nearbyZones.reduce((prev, current) =>
            (prev.risk_score > current.risk_score) ? prev : current
        );

        return { type: 'suggestion', ...bestZone };
    }, [location, redZones, assignedEmergency, profile?.is_available]);

    const nearbyRedZonesCount = useMemo(() => {
        if (!location || !redZones.length) return 0;
        return redZones.filter(zone =>
            calculateDistance(location.lat, location.lng, zone.center_lat, zone.center_lon) <= 5.0
        ).length;
    }, [location, redZones]);

    // Navigation State Management
    const navigationMode = useMemo(() => {
        if (assignedEmergency) return 'dispatch';
        if (profile?.is_available) return 'standby';
        return 'idle';
    }, [assignedEmergency, profile?.is_available]);

    // Clear standby target if offline or assigned
    useEffect(() => {
        if (navigationMode !== 'standby') {
            setActiveStandbyTarget(null);
        }
    }, [navigationMode]);

    // Fetch assigned emergency for the driver
    const fetchAssignedEmergency = useCallback(async () => {
        if (!user) return
        const { data, error } = await supabase
            .from('emergency_requests')
            .select('*')
            .eq('driver_id', user.id)
            .in('status', ['assigned', 'accepted'])
            .maybeSingle()

        if (!error) setAssignedEmergency(data)
    }, [user])

    // Fetch nearby available requests
    const fetchNearbyRequests = useCallback(async () => {
        if (!location) return

        const { data, error } = await supabase
            .from('emergency_requests')
            .select('*')
            .is('driver_id', null)
            .eq('status', 'pending')

        if (!error && data) {
            const filtered = data
                .map(req => ({
                    ...req,
                    distance: calculateDistance(location.lat, location.lng, req.latitude, req.longitude)
                }))
                .filter(req => req.distance <= 5.0) // 5km radius
                .sort((a, b) => a.distance - b.distance)

            setNearbyRequests(filtered)
        }
    }, [location])

    // Fetch accidents for heatmap
    const fetchAccidents = useCallback(async () => {
        const { data, error } = await supabase.from('accidents').select('*')
        if (!error) setAccidents(data)
    }, [])

    // Fetch red zones
    const fetchRedZones = useCallback(async () => {
        const { data, error } = await supabase.from('red_zones').select('*')
        if (!error) setRedZones(data)
    }, [])

    // Fetch Dashboard Stats
    const fetchDashboardStats = useCallback(async () => {
        if (!user) return
        const { data, error } = await supabase.rpc('get_driver_stats', { id_param: user.id })
        if (!error && data && data.length > 0) {
            setDashStats({
                trips: data[0].trips_count,
                avgResponse: data[0].avg_response_min
            })
        }
    }, [user])

    useEffect(() => {
        if (user) {
            fetchAssignedEmergency()
            fetchNearbyRequests()
            fetchAccidents()
            fetchRedZones()
            fetchDashboardStats()
        }
    }, [user, fetchAssignedEmergency, fetchNearbyRequests, fetchAccidents, fetchRedZones, fetchDashboardStats])

    // Subscriptions
    useEffect(() => {
        if (!user) return

        const channel = supabase.channel('dashboard-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests' }, () => {
                fetchAssignedEmergency()
                fetchNearbyRequests()
                fetchDashboardStats()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'accidents' }, () => fetchAccidents())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'red_zones' }, () => fetchRedZones())
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [user, fetchAssignedEmergency, fetchNearbyRequests, fetchAccidents, fetchRedZones, fetchDashboardStats])

    const acceptRequest = async (requestId) => {
        if (!user) return
        const { error } = await supabase
            .from('emergency_requests')
            .update({
                status: 'accepted',
                driver_id: user.id,
                accepted_at: new Date().toISOString()
            })
            .eq('id', requestId)

        if (!error) await updateAvailability(false)
    }

    const resolveRequest = async (requestId) => {
        if (!user) return
        const { error } = await supabase
            .from('emergency_requests')
            .update({
                status: 'resolved',
                resolved_at: new Date().toISOString()
            })
            .eq('id', requestId)

        if (!error) {
            setAssignedEmergency(null)
            await updateAvailability(true)
            fetchAssignedEmergency()
            fetchDashboardStats()
        }
    }

    const mapCenter = useMemo(() => {
        if (forcedCenter) return forcedCenter;
        if (focusMyLocation && location) return location;
        if (navigationMode === 'dispatch' && assignedEmergency) return { lat: assignedEmergency.latitude, lng: assignedEmergency.longitude };
        if (navigationMode === 'standby' && positionSuggestion?.type === 'suggestion') return { lat: positionSuggestion.center_lat, lng: positionSuggestion.center_lon };
        return location || { lat: 0, lng: 0 };
    }, [forcedCenter, focusMyLocation, location, navigationMode, assignedEmergency, positionSuggestion]);

    const routeEnd = useMemo(() => {
        if (navigationMode === 'dispatch' && assignedEmergency) {
            return { lat: assignedEmergency.latitude, lng: assignedEmergency.longitude };
        }
        if (navigationMode === 'standby' && activeStandbyTarget) {
            return activeStandbyTarget;
        }
        return null;
    }, [navigationMode, assignedEmergency, activeStandbyTarget]);

    const handleNavigateToZone = (lat, lng) => {
        if (navigationMode === 'dispatch') return;
        setFocusMyLocation(false);
        setForcedCenter({ lat, lng });
        setActiveStandbyTarget({ lat, lng });
        // Auto-show red zones if we are navigating to one
        setShowRedZones(true);
    };

    const handleResetFocus = () => {
        setForcedCenter(null);
        setFocusMyLocation(true);
    };

    const stats = [
        { label: 'Trips Today', value: dashStats.trips.toString(), icon: '🚑', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { label: 'Avg Response Time', value: `${dashStats.avgResponse.toFixed(1)}m`, icon: '⏱️', color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { label: 'Red Zones Nearby', value: nearbyRedZonesCount.toString(), icon: '⚠️', color: 'text-orange-500', bg: 'bg-orange-500/10' },
        { label: 'Driver Rating', value: '4.9', icon: '⭐', color: 'text-yellow-500', bg: 'bg-yellow-500/10' }
    ]

    if (!user) return null

    return (
        <div className="min-h-[calc(100vh-64px)] bg-[#0B1220] flex flex-col p-6 gap-6">

            {/* Metrics Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-800/50 p-5 rounded-xl shadow-xl backdrop-blur-sm flex flex-col gap-2 transition-all hover:border-slate-700/50">
                        <div className="flex justify-between items-center">
                            <span className={`p-2 rounded-lg text-lg ${stat.bg}`}>{stat.icon}</span>
                        </div>
                        <div className="mt-1">
                            <span className="text-3xl font-black text-white">{stat.value}</span>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mt-1">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Dashboard Layout: Two Columns */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6">

                {/* Left Column: Mission Controls */}
                <div className="lg:w-80 xl:w-96 flex flex-col gap-6">

                    {/* Assigned Emergency Card */}
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-6 shadow-xl backdrop-blur-sm flex flex-col gap-4 transition-all overflow-hidden group">
                        <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                            <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${assignedEmergency ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-700'}`}></span>
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Assigned Dispatch</h3>
                            </div>
                            {assignedEmergency && (
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border uppercase tracking-widest ${assignedEmergency.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                    {assignedEmergency.status === 'accepted' ? 'En Route' : 'Assigned'}
                                </span>
                            )}
                        </div>

                        {assignedEmergency ? (
                            <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-500">
                                <div>
                                    <h4 className="text-xl font-black text-white mb-1 uppercase tracking-tight">{assignedEmergency.type} Emergency</h4>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-slate-400 font-medium">📍 {assignedEmergency.requester_name || 'Active Incident'}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 py-4 border-y border-slate-800/50">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-slate-500 uppercase">Dist to Site</p>
                                        <p className="text-sm font-black text-slate-200 uppercase">{routeDetails ? routeDetails.distance : 'Calculating...'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-slate-500 uppercase">Travel Time</p>
                                        <p className="text-sm font-black text-emerald-500">{routeDetails ? routeDetails.duration : '...'}</p>
                                    </div>
                                </div>

                                {assignedEmergency.status === 'pending' && (
                                    <button
                                        onClick={() => acceptRequest(assignedEmergency.id)}
                                        className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black rounded-xl shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-2 group/btn"
                                    >
                                        ACCEPT DISPATCH
                                        <span className="text-lg group-hover/btn:translate-x-1 transition-transform">→</span>
                                    </button>
                                )}

                                {assignedEmergency.status === 'accepted' && (
                                    <button
                                        onClick={() => resolveRequest(assignedEmergency.id)}
                                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 group/btn"
                                    >
                                        RESOLVE MISSION
                                        <Activity size={14} className="group-hover/btn:scale-110 transition-transform" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="py-10 text-center space-y-4">
                                <div className="w-14 h-14 bg-slate-950/50 rounded-2xl flex items-center justify-center mx-auto text-2xl opacity-30 border border-slate-800 group-hover:scale-110 transition-transform">
                                    🚑
                                </div>
                                <div className="space-y-1">
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">No active emergency</p>
                                    <p className="text-slate-600 text-[10px] font-bold uppercase tracking-tight">You're on standby</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Strategic Positioning Suggestion */}
                    {profile?.is_available && !assignedEmergency && (
                        <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-6 shadow-xl backdrop-blur-sm flex flex-col gap-4 transition-all overflow-hidden group border-l-4 border-l-blue-500/50">
                            <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                                <div className="flex items-center gap-2">
                                    <Radar size={14} className="text-blue-500 animate-pulse" />
                                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Tactical Positioning</h3>
                                </div>
                            </div>

                            {positionSuggestion?.type === 'suggestion' ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div>
                                        <h4 className="text-sm font-black text-white mb-1 uppercase tracking-tight">High Risk Zone Detected</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Strategic recommendation for optimal coverage</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-800/50">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-500 uppercase">Distance</p>
                                            <p className="text-sm font-black text-blue-500 uppercase">{positionSuggestion.distance.toFixed(1)} km</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-500 uppercase">Incident Density</p>
                                            <p className="text-sm font-black text-orange-500">{positionSuggestion.risk_score} Points</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleNavigateToZone(positionSuggestion.center_lat, positionSuggestion.center_lon)}
                                        disabled={!!assignedEmergency}
                                        className={`w-full py-2.5 text-[10px] font-black rounded-xl transition-all border flex items-center justify-center gap-2 uppercase tracking-widest ${assignedEmergency ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white border-blue-500/20'}`}
                                    >
                                        <Navigation size={12} />
                                        {activeStandbyTarget ? 'Updating Route...' : 'Navigate to Hotspot'}
                                    </button>
                                </div>
                            ) : (
                                <div className="py-6 text-center space-y-3 opacity-40">
                                    <div className="text-xl">🛡️</div>
                                    <div className="space-y-1">
                                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-4 leading-relaxed">No high-risk zones within 5km of current patrol.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Nearby Requests List */}
                    <div className="flex-1 bg-slate-900/40 border border-slate-800/50 rounded-3xl overflow-hidden shadow-xl backdrop-blur-sm flex flex-col">
                        <div className="bg-slate-800/30 px-6 py-4 border-b border-slate-800/50 flex justify-between items-center">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Nearby Requests</h3>
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-black border border-red-500/20">
                                {nearbyRequests.length} PENDING
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {nearbyRequests.length > 0 ? nearbyRequests.map((req) => (
                                <div key={req.id} className="bg-slate-950/40 border border-slate-800/50 p-4 rounded-2xl hover:border-slate-600 transition-all group/item">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-start gap-2">
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
                                            <div>
                                                <p className="text-sm font-black text-white leading-tight">{req.type} Emergency</p>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                                                    {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[11px] font-black text-slate-300 bg-slate-800 px-2 py-1 rounded-lg">
                                            {req.distance?.toFixed(1)} km
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => acceptRequest(req.id)}
                                        className="w-full mt-3 py-2 bg-slate-800 hover:bg-emerald-600 text-white text-[10px] font-black rounded-xl transition-all border border-slate-700 hover:border-emerald-500 uppercase tracking-widest"
                                    >
                                        Accept Request
                                    </button>
                                </div>
                            )) : (
                                <div className="flex flex-col items-center justify-center h-full opacity-20 py-10">
                                    <div className="text-2xl mb-2">📡</div>
                                    <p className="text-[10px] font-black uppercase tracking-widest">Scanning Grid...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Mission Map */}
                <div className="flex-1 bg-slate-900/40 border border-slate-800/50 rounded-[40px] overflow-hidden relative shadow-2xl backdrop-blur-sm group min-h-[500px]">

                    {/* Map Overlays */}
                    <div className="absolute top-8 left-8 right-8 z-10 flex flex-col md:flex-row justify-between items-start gap-4">
                        {/* Title Overlay */}
                        <div className="bg-slate-950/90 backdrop-blur-xl px-4 py-2.5 border border-slate-800/50 rounded-xl shadow-2xl flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Area Map & Red Zones</span>
                        </div>

                        {/* Map Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowHeatmap(!showHeatmap)}
                                className={`px-4 py-2 border rounded-xl shadow-xl flex items-center gap-2 transition-all backdrop-blur-xl ${showHeatmap ? 'bg-orange-500/20 border-orange-500/50' : 'bg-slate-950/90 border-slate-800/50'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${showHeatmap ? 'bg-orange-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${showHeatmap ? 'text-orange-500' : 'text-slate-400'}`}>
                                    {showHeatmap ? 'Disable Heatmap' : 'Enable Heatmap'}
                                </span>
                            </button>
                            <button
                                onClick={() => setShowRedZones(!showRedZones)}
                                className={`px-4 py-2 border rounded-xl shadow-xl flex items-center gap-2 transition-all backdrop-blur-xl ${showRedZones ? 'bg-red-500/20 border-red-500/50' : 'bg-slate-950/90 border-slate-800/50'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${showRedZones ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${showRedZones ? 'text-red-500' : 'text-slate-400'}`}>
                                    {showRedZones ? 'Hide Red Zones' : 'Show Red Zones'}
                                </span>
                            </button>
                            <button
                                onClick={handleResetFocus}
                                className={`px-4 py-2 border rounded-xl shadow-xl flex items-center gap-2 transition-all backdrop-blur-xl ${focusMyLocation && !forcedCenter ? 'bg-blue-500/20 border-blue-500/50' : 'bg-slate-950/90 border-slate-800/50'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${focusMyLocation && !forcedCenter ? 'bg-blue-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${focusMyLocation && !forcedCenter ? 'text-blue-500' : 'text-slate-400'}`}>My Location</span>
                            </button>
                        </div>
                    </div>

                    {/* Actual Map Component */}
                    <div className="absolute inset-0">
                        <AppMap
                            center={mapCenter}
                            accidents={accidents}
                            redZones={redZones}
                            showHeatmap={showHeatmap}
                            showRedZones={showRedZones}
                            routeStart={location}
                            routeEnd={routeEnd}
                            markers={assignedEmergency ? [
                                { lat: assignedEmergency.latitude, lng: assignedEmergency.longitude, title: 'Emergency', icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' } }
                            ] : []}
                            onRouteUpdate={setRouteDetails}
                        />
                    </div>

                    {/* Navigation Info Overlay */}
                    {routeDetails && routeEnd && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-sm">
                            <div className="bg-slate-950/95 backdrop-blur-2xl border border-slate-800/50 rounded-2xl shadow-2xl p-4 flex items-center justify-between border-b-4 border-b-emerald-500/50">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${navigationMode === 'dispatch' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                        <Navigation size={22} className={navigationMode === 'dispatch' ? 'animate-pulse' : ''} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-0.5">
                                            {navigationMode === 'dispatch' ? 'Responding to Emergency' : 'Tactical Standby'}
                                        </p>
                                        <p className="text-white font-black text-sm uppercase">
                                            {navigationMode === 'dispatch' ? assignedEmergency.type : 'Red Zone Hub'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-black text-emerald-500 leading-none mb-1">{routeDetails.duration}</p>
                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{routeDetails.distance}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
