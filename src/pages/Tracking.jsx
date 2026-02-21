import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { MapPin, Phone, User, Clock, CheckCircle2, Navigation, AlertCircle, Shield, Heart, Activity, ChevronDown, ChevronUp } from 'lucide-react'
import AppMap from '../components/AppMap'
import { getNearbyPlaces } from '../services/places'
import { generateFirstAid } from '../services/gemini'
import ReactMarkdown from 'react-markdown'

export default function Tracking() {
    const [searchParams] = useSearchParams()
    const requestId = searchParams.get('id')
    const [request, setRequest] = useState(null)
    const [driverLocation, setDriverLocation] = useState(null)
    const [loading, setLoading] = useState(true)
    const [nearbyPlaces, setNearbyPlaces] = useState([])
    const [loadingPlaces, setLoadingPlaces] = useState(false)
    const [firstAidGuidance, setFirstAidGuidance] = useState('')
    const [loadingGuidance, setLoadingGuidance] = useState(false)
    const [isAidOpen, setIsAidOpen] = useState(true)
    const [routeDetails, setRouteDetails] = useState(null)
    const [showHospitals, setShowHospitals] = useState(false)
    const [showPolice, setShowPolice] = useState(false)

    // Distance Helper (km)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    }

    // Format Date Helper
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' +
            date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    useEffect(() => {
        if (!requestId) return

        const fetchRequest = async () => {
            const { data, error } = await supabase
                .from('emergency_requests')
                .select('*')
                .eq('id', requestId)
                .single()

            if (!error && data) {
                setRequest(data)
                if (data.driver_id) fetchDriverLocation(data.driver_id)
                fetchNearbyServices(data.latitude, data.longitude)
                fetchGuidance(data.type, data.severity)
            }
            setLoading(false)
        }

        const fetchGuidance = async (type, severity) => {
            setLoadingGuidance(true)
            const sevMap = { 5: 'high', 3: 'medium', 1: 'low' }
            const sevLabel = sevMap[severity] || 'unknown'
            const guidance = await generateFirstAid(type, sevLabel)
            setFirstAidGuidance(guidance)
            setLoadingGuidance(false)
        }

        const fetchNearbyServices = async (lat, lng) => {
            setLoadingPlaces(true)
            try {
                const hospitals = await getNearbyPlaces(lat, lng, 'hospital')
                const police = await getNearbyPlaces(lat, lng, 'police')
                setNearbyPlaces([...hospitals, ...police])
            } catch (e) {
                console.error("Nearby search failed:", e)
            } finally {
                setLoadingPlaces(false)
            }
        }

        const fetchDriverLocation = async (driverId) => {
            const { data } = await supabase
                .from('profiles')
                .select('latitude, longitude')
                .eq('id', driverId)
                .single()
            if (data?.latitude) setDriverLocation({ lat: data.latitude, lng: data.longitude })
        }

        fetchRequest()

        // 1. Subscribe to Request Changes (Status, Driver Assignment)
        const requestChannel = supabase.channel(`tracking_${requestId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'emergency_requests', filter: `id=eq.${requestId}` },
                (payload) => {
                    setRequest(payload.new)
                    if (payload.new.driver_id && !driverLocation) {
                        fetchDriverLocation(payload.new.driver_id)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(requestChannel)
        }
    }, [requestId])

    // 2. Separate Subscription for Driver Location Movements
    useEffect(() => {
        if (!request?.driver_id) return

        const driverChannel = supabase.channel(`driver_loc_${request.driver_id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${request.driver_id}` },
                (payload) => {
                    if (payload.new.latitude && payload.new.longitude) {
                        setDriverLocation({ lat: payload.new.latitude, lng: payload.new.longitude })
                    }
                }
            )
            .subscribe()

        return () => supabase.removeChannel(driverChannel)
    }, [request?.driver_id])

    const mapMarkers = useMemo(() => {
        if (!request) return []
        const markers = [
            {
                lat: request.latitude,
                lng: request.longitude,
                title: 'Emergency Site',
                icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
            }
        ]

        // Add nearby markers based on toggles
        nearbyPlaces.forEach(p => {
            if (p.type === 'hospital' && !showHospitals) return;
            if (p.type === 'police' && !showPolice) return;

            markers.push({
                lat: p.lat,
                lng: p.lng,
                title: p.name,
                icon: p.type === 'hospital' ? "http://maps.google.com/mapfiles/ms/icons/hospitals.png" : "http://maps.google.com/mapfiles/ms/icons/police.png"
            })
        })

        return markers
    }, [request, nearbyPlaces, showHospitals, showPolice])

    const driverLocations = useMemo(() => {
        return driverLocation ? [driverLocation] : []
    }, [driverLocation])

    if (!requestId) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 bg-[#0B1220]">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <MapPin className="text-red-500 w-10 h-10" />
                </div>
                <h1 className="text-3xl font-black text-white mb-4 tracking-tight">Access Denied</h1>
                <p className="text-slate-400 max-w-md mb-8">No valid emergency tracking ID was found in your request.</p>
                <Link to="/" className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all">
                    Return to Mission Hub
                </Link>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center bg-[#0B1220]">
                <div className="w-16 h-16 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin mb-4"></div>
                <p className="text-red-500 font-black animate-pulse tracking-widest text-xs uppercase">Connecting to Dispatch Grid...</p>
            </div>
        )
    }

    return (
        <div className="min-h-[calc(100vh-64px)] bg-[#0B1220] flex flex-col lg:flex-row overflow-hidden">
            {/* Left Data Side */}
            <div className="w-full lg:w-[450px] border-r border-slate-800 bg-[#0B1220]/80 backdrop-blur-xl z-10 flex flex-col h-full lg:h-[calc(100vh-64px)] overflow-y-auto custom-scrollbar">
                <div className="p-8">
                    {/* Status Header */}
                    <div className="mb-10">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="relative flex h-3 w-3">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${request?.status === 'pending' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${request?.status === 'pending' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">System Live</span>
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tighter mb-2 leading-tight">
                            {request?.status === 'pending' && !request?.driver_id ? 'Searching for Responders' :
                                (request?.status === 'pending' && request?.driver_id) ? 'Medical Unit Assigned' :
                                    request?.status === 'accepted' ? 'Ambulance En Route' : 'Mission Completed'}
                        </h1>
                        <div className="flex flex-col gap-4 mt-4">
                            <p className="text-slate-500 text-sm font-medium italic">Request filed at {formatDate(request?.created_at)}</p>
                            {request?.status === 'resolved' && (
                                <Link
                                    to="/"
                                    className="w-fit px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-emerald-900/20"
                                >
                                    Return to Mission Hub
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Dist to Site</span>
                            <span className="text-xs font-black text-white uppercase">
                                {routeDetails ? routeDetails.distance : 'Calculating...'}
                            </span>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">ETA</span>
                            <span className={`text-xs font-black uppercase ${routeDetails ? 'text-emerald-500' : 'text-slate-600'}`}>
                                {routeDetails ? routeDetails.duration : 'Estimating...'}
                            </span>
                        </div>
                    </div>

                    {/* Patient Section */}
                    <div className="space-y-6 mb-10">
                        <div className="group">
                            <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/5 group-hover:bg-white/[0.08] transition-all">
                                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                                    <User size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-0.5">Patient Info</span>
                                    <p className="text-white font-bold">{request?.requester_name || 'Anonymous Patient'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="group">
                            <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/5 group-hover:bg-white/[0.08] transition-all">
                                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                                    <Phone size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-0.5">Contact Line</span>
                                    <p className="text-white font-bold">{request?.requester_phone || 'Emergency Direct'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* First Aid Guidance Panel */}
                    <div className="mb-8 overflow-hidden rounded-3xl border border-amber-500/10 bg-amber-500/5 shadow-lg shadow-amber-900/10">
                        <button
                            onClick={() => setIsAidOpen(!isAidOpen)}
                            className="flex w-full items-center justify-between p-6 transition-colors hover:bg-amber-500/10"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white">
                                    <Activity size={20} />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-sm font-black uppercase tracking-widest text-white">Immediate Life Support</h2>
                                    <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-tighter">Essential Rescue Steps</p>
                                </div>
                            </div>
                            {isAidOpen ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                        </button>

                        {isAidOpen && (
                            <div className="px-6 pb-8 animate-fade-in">
                                <div className="h-px w-full bg-amber-500/10 mb-6" />
                                {loadingGuidance ? (
                                    <div className="flex flex-col items-center py-6 gap-3">
                                        <div className="w-6 h-6 border-2 border-amber-600/20 border-t-amber-600 rounded-full animate-spin"></div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/50">Analyzing Incident Context...</span>
                                    </div>
                                ) : (
                                    <div className="prose prose-invert prose-sm max-w-none first-aid-content">
                                        <ReactMarkdown
                                            components={{
                                                li: ({ children }) => <li className="text-slate-300 mb-2 list-none flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" /> {children}</li>,
                                                p: ({ children }) => <p className="text-slate-400 mb-4 font-medium leading-relaxed">{children}</p>
                                            }}
                                        >
                                            {firstAidGuidance || `
# Immediate Actions:
- **Safety First**: Ensure the scene is safe for you and the victim.
- **Check ABCs**: Check Airway, Breathing, and Circulation.
- **Stop Bleeding**: Apply firm, direct pressure to any bleeding wounds.
- **Stabilize**: Do not move the victim unless there is an immediate threat.
- **Stay Calm**: Wait for the first responder unit assigned.
                                            `}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Location Details */}
                    <div className="p-6 rounded-3xl bg-gradient-to-br from-red-600/10 to-transparent border border-red-600/10 mb-8">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white">
                                <MapPin size={16} />
                            </div>
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Incident Coordinates</h3>
                        </div>
                        <div className="space-y-2 opacity-80">
                            <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded-lg border border-white/5">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Lat</span>
                                <span className="text-[10px] font-bold text-white font-mono tracking-wider">{request?.latitude.toFixed(6)}</span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded-lg border border-white/5">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Lng</span>
                                <span className="text-[10px] font-bold text-white font-mono tracking-wider">{request?.longitude.toFixed(6)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ID Footer */}
                    <div className="mt-12 mb-8 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/30 border border-white/5 w-fit">
                        <AlertCircle size={10} className="text-slate-600" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">REQ-ID: {request?.id.slice(0, 8)}</span>
                    </div>

                    {/* Nearby Services Section */}
                    <div className="mt-4 pb-12">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Safe Zones & Hospitals</h2>
                            {loadingPlaces && <div className="w-4 h-4 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin"></div>}
                        </div>

                        <div className="space-y-4">
                            {nearbyPlaces.length > 0 ? (
                                nearbyPlaces.map((place) => (
                                    <div key={place.id} className="p-4 rounded-2xl bg-slate-900/40 border border-white/[0.03] hover:border-white/10 transition-all group">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${place.type === 'hospital' ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'bg-blue-500/10 text-blue-500'}`}>
                                                    {place.type === 'hospital' ? <Heart size={14} /> : <Shield size={14} />}
                                                </div>
                                                <div>
                                                    <h3 className="text-xs font-bold text-white leading-tight group-hover:text-red-500 transition-colors uppercase">{place.name}</h3>
                                                    <p className="text-[10px] text-slate-500 font-medium truncate max-w-[180px]">{place.address}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black text-white">{calculateDistance(request.latitude, request.longitude, place.lat, place.lng)}km</span>
                                                <span className="text-[9px] block text-slate-500 uppercase tracking-tighter">Distance</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-3">
                                            {/* Mocking phone number since nearbySearch doesn't provide it directly without extra details call */}
                                            <a
                                                href={`tel:911`}
                                                className="flex-1 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-500 transition-all"
                                            >
                                                Emergency Line
                                            </a>
                                            <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all">
                                                Map
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : !loadingPlaces && (
                                <p className="text-xs text-slate-500 italic">No safe zones detected within 5km of incident.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Map Side */}
            <div className="flex-1 relative h-[400px] lg:h-full bg-slate-950 overflow-hidden">
                <AppMap
                    center={{ lat: request.latitude, lng: request.longitude }}
                    markers={mapMarkers}
                    driverLocations={driverLocations}
                    routeStart={driverLocation}
                    routeEnd={request.driver_id ? { lat: request.latitude, lng: request.longitude } : null}
                    onRouteUpdate={setRouteDetails}
                    showHeatmap={false}
                    showRedZones={false}
                />

                {/* Map Controls (Toggles) */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                    <button
                        onClick={() => setShowHospitals(!showHospitals)}
                        className={`px-4 py-2 border rounded-xl shadow-xl flex items-center gap-2 transition-all backdrop-blur-xl ${showHospitals ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-950/90 border-slate-800/50'}`}
                    >
                        <Heart size={14} className={showHospitals ? 'text-emerald-500' : 'text-slate-400'} />
                        <span className={`text-[9px] font-black uppercase tracking-widest ${showHospitals ? 'text-emerald-500' : 'text-slate-400'}`}>Hospitals</span>
                    </button>
                    <button
                        onClick={() => setShowPolice(!showPolice)}
                        className={`px-4 py-2 border rounded-xl shadow-xl flex items-center gap-2 transition-all backdrop-blur-xl ${showPolice ? 'bg-blue-500/20 border-blue-500/50' : 'bg-slate-950/90 border-slate-800/50'}`}
                    >
                        <Shield size={14} className={showPolice ? 'text-blue-500' : 'text-slate-400'} />
                        <span className={`text-[9px] font-black uppercase tracking-widest ${showPolice ? 'text-blue-500' : 'text-slate-400'}`}>Police</span>
                    </button>
                </div>

                {!request.driver_id && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-12 text-center bg-[#0B1220]/60 backdrop-blur-sm">
                        {/* Radar/Scanning Animation */}
                        <div className="relative mb-12">
                            <div className="absolute inset-0 rounded-full bg-red-600/20 animate-ping" style={{ animationDuration: '3s' }}></div>
                            <div className="absolute inset-0 rounded-full bg-red-600/10 animate-ping" style={{ animationDuration: '2s' }}></div>
                            <div className="w-24 h-24 rounded-full border-2 border-red-600/30 flex items-center justify-center relative z-10 bg-slate-900 shadow-[0_0_50px_rgba(239,68,68,0.1)]">
                                <Activity className="text-red-600 w-10 h-10 animate-pulse" />
                            </div>
                        </div>

                        <h2 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase">Scanning Grid</h2>
                        <div className="flex flex-col gap-2 max-w-sm">
                            <p className="text-slate-200 font-bold text-sm drop-shadow-lg">Locating nearest mobile responder unit...</p>
                            <div className="mt-4 flex items-center justify-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-bounce"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-bounce [animation-delay:-0.3s]"></div>
                            </div>
                        </div>
                    </div>
                ) || (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-sm">
                            <div className="bg-slate-950/95 backdrop-blur-2xl border border-slate-800/50 rounded-2xl shadow-2xl p-4 flex items-center justify-between border-b-4 border-b-emerald-500/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                        <Navigation size={22} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-0.5">Ambulance En Route</p>
                                        <p className="text-white font-black text-sm uppercase">Medical Responder</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-black text-emerald-500 leading-none mb-1">{routeDetails ? routeDetails.duration : 'Calculating...'}</p>
                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{routeDetails ? routeDetails.distance : '...'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                {/* Floating Map Indicators */}
                <div className="absolute top-6 right-6 flex flex-col gap-3 z-20">
                    <div className="bg-[#0B1220]/90 backdrop-blur-md border border-slate-800 px-4 py-3 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">Incident Site</span>
                        </div>
                    </div>
                    {driverLocation && (
                        <div className="bg-[#0B1220]/90 backdrop-blur-md border border-slate-800 px-4 py-3 rounded-2xl shadow-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)] animate-pulse"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white">Ambulance Unit</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 20px; }
            `}</style>
        </div>
    )
}
