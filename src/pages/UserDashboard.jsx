import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { useRequestStore } from '../store/useRequestStore'
import { supabase } from '../services/supabase'
import AppMap from '../components/AppMap'
import { verifyCrashImage, generateFirstAid } from '../services/gemini'
import { getNearbyPlaces } from '../services/places'

export default function UserDashboard() {
    const { user } = useAuthStore()
    const navigate = useNavigate()
    const { location, error: locationError } = useLocationTracking(user?.id, 'user')
    const { activeRequest, createRequest, subscribeToRequests, loading: requestLoading } = useRequestStore()

    const [errorMsg, setErrorMsg] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [verifyingImg, setVerifyingImg] = useState(false)
    const [mustConfirm, setMustConfirm] = useState(false)

    // First Aid State
    const [firstAidText, setFirstAidText] = useState('')
    const [loadingFirstAid, setLoadingFirstAid] = useState(false)

    // Places Locator State
    const [nearbyPlaces, setNearbyPlaces] = useState([])
    const [loadingPlaces, setLoadingPlaces] = useState(false)

    // Form States
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [type, setType] = useState('medical')
    const [imageFile, setImageFile] = useState(null)

    // Dynamic Stats
    const [stats, setStats] = useState({ active: 0, drivers: 0 })

    // Driver Tracking State
    const [assignedDriverLocation, setAssignedDriverLocation] = useState(null)

    useEffect(() => {
        const fetchStats = async () => {
            const { count: activeCount } = await supabase
                .from('emergency_requests')
                .select('*', { count: 'exact', head: true })
                .in('status', ['pending', 'accepted'])

            const { count: driverCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'driver')
                .eq('is_available', true)

            setStats({ active: activeCount || 0, drivers: driverCount || 0 })
        }
        fetchStats()

        // Realtime stats sync (optional but nice)
        const channel = supabase.channel('stats_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests' }, fetchStats)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchStats)
            .subscribe()

        return () => supabase.removeChannel(channel)
    }, [])

    useEffect(() => {
        // Anonymous realtime subscription
        const anonymousSubscriptionTarget = 'anonymous-user-session';
        const unsubscribe = subscribeToRequests('user', anonymousSubscriptionTarget);
        return () => unsubscribe();
    }, [subscribeToRequests])

    // Generate First Aid and Track Driver
    useEffect(() => {
        if (activeRequest && !firstAidText && !loadingFirstAid) {
            const fetchAid = async () => {
                setLoadingFirstAid(true);
                const advice = await generateFirstAid(activeRequest.type);
                setFirstAidText(advice);
                setLoadingFirstAid(false);
            }
            fetchAid();
        }

        // Live Driver Tracking for Patient
        if (activeRequest?.driver_id) {
            const channel = supabase.channel(`driver_track_${activeRequest.driver_id}`)
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${activeRequest.driver_id}` },
                    (payload) => {
                        if (payload.new.latitude && payload.new.longitude) {
                            setAssignedDriverLocation({ lat: payload.new.latitude, lng: payload.new.longitude })
                        }
                    }
                )
                .subscribe()

            // Initial fetch
            const fetchDriverLoc = async () => {
                const { data } = await supabase.from('profiles').select('latitude, longitude').eq('id', activeRequest.driver_id).single()
                if (data?.latitude) setAssignedDriverLocation({ lat: data.latitude, lng: data.longitude })
            }
            fetchDriverLoc()

            return () => supabase.removeChannel(channel)
        }
    }, [activeRequest, firstAidText, loadingFirstAid]);

    const fetchHelp = async () => {
        if (!location) return;
        setLoadingPlaces(true);
        try {
            const hospitals = await getNearbyPlaces(location.lat, location.lng, 'hospital');
            const police = await getNearbyPlaces(location.lat, location.lng, 'police');
            setNearbyPlaces([...hospitals, ...police]);
        } catch (e) {
            console.error("Failed to fetch nearby places", e);
        }
        setLoadingPlaces(false);
    }

    const handleSos = async () => {
        if (!location) {
            setErrorMsg("Acquiring location... Please wait.")
            return
        }
        setErrorMsg('')

        // --- GEMINI IMAGE VERIFICATION ---
        let reportSeverity = null;
        if (type === 'crash') {
            if (!imageFile) {
                setErrorMsg("An image is mandatory to verify a crash.")
                return;
            }
            setVerifyingImg(true);
            const geminiResult = await verifyCrashImage(imageFile);
            setVerifyingImg(false);

            if (geminiResult.is_fallback) {
                console.warn("AI Verification bypassed due to service constraints.");
                setErrorMsg("AI Verification Unavailable: A responder will verify manually.");
            }

            if (!geminiResult.crash_detected && !mustConfirm) {
                setErrorMsg(`AI Verification: Negative result. (${geminiResult.reason || 'Confirm if this is an error.'})`);
                setMustConfirm(true);
                return;
            }

            // Map AI severity to numeric points (5=High, 3=Med, 1=Low)
            reportSeverity = geminiResult.severity === 'high' ? 5 : geminiResult.severity === 'medium' ? 3 : 1;
        }

        // Anonymous request with form data
        const { data, error } = await createRequest(location, type, imageFile, name, phone, reportSeverity)
        if (error) {
            setErrorMsg("Failed to dispatch: " + error.message)
        } else if (data) {
            // Success! Navigate to tracking page
            navigate(`/tracking?id=${data.id}`)
        }
    }

    // Derived overall loading state
    const loading = requestLoading || verifyingImg;

    // Build Map Markers
    const mapMarkers = activeRequest ? [{ lat: activeRequest.latitude, lng: activeRequest.longitude, title: 'Emergency Site', icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png" }] : [];
    if (nearbyPlaces.length > 0) {
        nearbyPlaces.forEach(p => {
            mapMarkers.push({
                lat: p.lat,
                lng: p.lng,
                title: p.name,
                icon: p.type === 'hospital' ? "http://maps.google.com/mapfiles/ms/icons/hospitals.png" : "http://maps.google.com/mapfiles/ms/icons/police.png"
            })
        })
    }

    // Build Secondary Nav Markers/States
    const [searchParams] = useSearchParams()
    const sectionParam = searchParams.get('section')
    const [activeSection, setActiveSection] = useState('sos')

    useEffect(() => {
        if (sectionParam) {
            setActiveSection(sectionParam)
            if (sectionParam === 'hospitals') fetchHelp()
        } else {
            setActiveSection('sos')
        }
    }, [sectionParam])

    const dynamicEta = useMemo(() => {
        if (!location || !assignedDriverLocation) return 'Calculating...';
        const dLat = Math.abs(location.lat - assignedDriverLocation.lat) * 111
        const dLng = Math.abs(location.lng - assignedDriverLocation.lng) * 111
        const dist = Math.sqrt(dLat * dLat + dLng * dLng)
        const timeMinutes = Math.round((dist / 40) * 60) + 2
        return timeMinutes < 1 ? 'Less than 1 min' : `${timeMinutes} min`
    }, [location, assignedDriverLocation]);

    return (
        <div className="min-h-[calc(100vh-64px)] flex flex-col items-center bg-[#0B1220]">
            <style>{`
                @keyframes soft-pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 40px rgba(239, 68, 68, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                .sos-pulse {
                    animation: soft-pulse 2s infinite;
                }
            `}</style>

            <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 flex flex-col items-center justify-center text-center">

                <div className="animate-fade-in flex flex-col items-center w-full">
                    {/* Location Status Indicator */}
                    <div className="mb-8 flex flex-col items-center">
                        {!location && !locationError && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-black uppercase tracking-widest animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                Location permission required
                            </div>
                        )}
                        {location && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-black uppercase tracking-widest">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                Location detected
                            </div>
                        )}
                        {locationError && (
                            <div className="flex flex-col items-center gap-3">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-black uppercase tracking-widest">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    GPS Error: {locationError.includes('denied') ? 'Permission Denied' : 'Signal Lost'}
                                </div>
                                <p className="text-slate-400 text-sm max-w-xs leading-tight">
                                    Please enable location access in your browser settings to use the SOS features.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Hero Section */}
                    <div className="mb-14">
                        <h1 className="text-5xl md:text-7xl font-black text-white mb-6 tracking-tight leading-tight">
                            Emergency Help,<br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-400">One Tap Away</span>
                        </h1>
                        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed">
                            Instantly dispatch the nearest ambulance with GPS tracking, AI-powered crash verification, and real-time medical guidance.
                        </p>
                    </div>

                    {/* Emergency Type Selector */}
                    <div className="flex bg-slate-900/50 p-1 rounded-2xl border border-slate-800 mb-8 w-full max-w-sm">
                        <button
                            onClick={() => setType('medical')}
                            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'medical' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Medical
                        </button>
                        <button
                            onClick={() => setType('crash')}
                            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'crash' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Accident
                        </button>
                    </div>

                    {/* Image Upload for Accidents */}
                    {type === 'crash' && (
                        <div className="w-full max-w-sm mb-10 animate-fade-in">
                            <div className="relative group overflow-hidden bg-slate-900/50 border border-slate-800 rounded-2xl p-6 transition-all hover:border-red-500/30">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 block">Crash Image Verification</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setImageFile(e.target.files[0])}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                />
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-red-600/10 flex items-center justify-center text-red-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-bold text-white">
                                        {imageFile ? imageFile.name : 'Upload Crash Photo'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Required for AI Validation</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Optional Info Inputs */}
                    {!locationError && (
                        <div className="w-full max-w-sm flex flex-col gap-4 mb-10 animate-fade-in delay-200">
                            <div className="relative group">
                                <label className="absolute left-4 -top-2.5 px-2 bg-[#0B1220] text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors group-focus-within:text-red-500">Patient Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-5 py-3.5 text-white placeholder:text-slate-700 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                />
                            </div>
                            <div className="relative group">
                                <label className="absolute left-4 -top-2.5 px-2 bg-[#0B1220] text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors group-focus-within:text-red-500">Your Contact</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-5 py-3.5 text-white placeholder:text-slate-700 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                />
                            </div>
                        </div>
                    )}

                    {/* Large Circular SOS Button */}
                    <div className="relative group">
                        {/* Glow behind */}
                        {!loading && <div className={`absolute inset-0 rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity ${mustConfirm ? 'bg-amber-600' : 'bg-red-600'} animate-pulse`}></div>}

                        {/* Inner pulse ring */}
                        {!loading && <div className={`absolute -inset-6 rounded-full sos-pulse ${mustConfirm ? 'bg-amber-600/10' : 'bg-red-600/10'}`}></div>}

                        <button
                            onClick={handleSos}
                            disabled={loading}
                            className={`relative w-64 h-64 md:w-80 md:h-80 rounded-full border-[10px] border-slate-900/50 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-2xl
                                ${loading ? 'bg-slate-800 text-slate-600 scale-95' :
                                    mustConfirm ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40' :
                                        'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40'}`}
                        >
                            <span className="text-7xl md:text-8xl font-black text-white tracking-widest mb-1 drop-shadow-lg">SOS</span>
                            <span className="text-red-100/70 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs">
                                {verifyingImg ? 'AI Verifying...' : loading ? 'Dispatching...' : 'Tap for Emergency'}
                            </span>
                        </button>
                    </div>

                    {errorMsg && <p className="mt-12 text-red-500 font-bold bg-red-500/10 px-6 py-3 rounded-2xl border border-red-500/20">{errorMsg}</p>}
                </div>

            </div>
        </div >
    )
}
