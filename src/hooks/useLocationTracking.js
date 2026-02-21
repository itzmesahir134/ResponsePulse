import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

export const useLocationTracking = (userId, role) => {
    const [location, setLocation] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!navigator.geolocation) {
            setError("Geolocation is not supported by your browser");
            return;
        }

        let watchId;
        let lastUpdateTime = 0;
        const UPDATE_INTERVAL = 5000; // 5 seconds

        const updateDB = async (lat, lng) => {
            const now = Date.now();
            if (!userId || (now - lastUpdateTime < UPDATE_INTERVAL)) return;

            lastUpdateTime = now;
            const { error } = await supabase
                .from('profiles')
                .update({ latitude: lat, longitude: lng })
                .eq('id', userId)
            if (error) console.error("Error updating location:", error)
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        };

        const startWatching = (opts) => {
            return navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lng: longitude });
                    setError(null);
                    updateDB(latitude, longitude);
                },
                (err) => {
                    console.error("Location error:", err);
                    if (err.code === 3 && opts.enableHighAccuracy) {
                        navigator.geolocation.clearWatch(watchId);
                        watchId = startWatching({ ...opts, enableHighAccuracy: false });
                    } else {
                        setError(err.message);
                    }
                },
                opts
            );
        };

        watchId = startWatching(options);

        return () => navigator.geolocation.clearWatch(watchId);
    }, [userId]);

    return { location, error };
}
