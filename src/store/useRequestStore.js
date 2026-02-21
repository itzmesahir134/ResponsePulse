import { create } from 'zustand'
import { supabase } from '../services/supabase'
import { useAuthStore } from './useAuthStore'

export const useRequestStore = create((set) => ({
    activeRequest: null,
    pendingRequests: [], // For drivers
    loading: false,

    // User: Creates a new anonymous emergency request
    createRequest: async (location, type = 'medical', imageUrl = null, name = null, phone = null, severity = null) => {
        set({ loading: true })

        const payload = {
            location,
            type,
        }

        // Ensure name/phone are added if they exist
        if (name) payload.requester_name = name;
        if (phone) payload.requester_phone = phone;

        let imageUrlToSave = imageUrl;

        // If a file object was passed in imageUrl instead of a string, upload it to Supabase Storage
        if (imageUrl && typeof imageUrl !== 'string') {
            const fileExt = imageUrl.name.split('.').pop()
            const fileName = `${Math.random()}.${fileExt}`
            const filePath = `${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('crash_images')
                .upload(filePath, imageUrl)

            if (!uploadError) {
                const { data: publicUrlData } = supabase.storage
                    .from('crash_images')
                    .getPublicUrl(filePath)
                imageUrlToSave = publicUrlData.publicUrl
            } else {
                console.error("Storage upload failed:", uploadError.message);
                // If storage fails, we don't want to pass a File object to the DB insert
                imageUrlToSave = null;
            }
        }

        // --- SERVER-SIDE ASSIGNMENT LOGIC ---
        // Nearest driver calculation and assignment are now handled by a Postgres Trigger on `emergency_requests`

        const newSchemaPayload = {
            latitude: location.lat,
            longitude: location.lng,
            type,
            image_url: imageUrlToSave,
            requester_name: name || undefined,
            requester_phone: phone || undefined,
            severity,
            crash_verified: type === 'crash' && severity !== null ? true : false,
            // driver_id and status are handled by the database trigger
        }

        const { data, error } = await supabase
            .from('emergency_requests')
            .insert([newSchemaPayload])
            .select()
            .single()

        if (!error && data) {
            set({ activeRequest: data })

            // If it was a verified crash, ALSO log it to the global accidents table for heatmaps
            if (newSchemaPayload.crash_verified && severity) {
                const numericSeverity = typeof severity === 'number' ? severity : (severity === 'high' ? 5 : severity === 'medium' ? 3 : 1);
                await supabase
                    .from('accidents')
                    .insert([{
                        latitude: location.lat,
                        longitude: location.lng,
                        severity: numericSeverity
                    }])
            }
        }
        set({ loading: false })
        return { data, error }
    },

    // Driver: Fetches assigned requests
    fetchPendingRequests: async (driverId) => {
        set({ loading: true })
        if (!driverId) {
            set({ pendingRequests: [], loading: false })
            return;
        }

        const { data, error } = await supabase
            .from('emergency_requests')
            .select('*')
            .eq('driver_id', driverId)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false })

        if (!error && data) {
            set({ pendingRequests: data })
        }
        set({ loading: false })
    },

    // Driver: Accepts a request
    acceptRequest: async (requestId, driverId) => {
        set({ loading: true })
        // If driver_id is already assigned by trigger, we just update status to 'accepted'
        const { data, error } = await supabase
            .from('emergency_requests')
            .update({ status: 'accepted', driver_id: driverId })
            .eq('id', requestId)
            .select()
            .single()

        if (!error && data) {
            // Remove from pending, set as active
            set((state) => ({
                activeRequest: data,
                pendingRequests: state.pendingRequests.filter(req => req.id !== requestId)
            }))
        }
        set({ loading: false })
        return { data, error }
    },

    // Driver: Resolves a request
    resolveRequest: async (requestId) => {
        set({ loading: true })
        const { data, error } = await supabase
            .from('emergency_requests')
            .update({ status: 'resolved' })
            .eq('id', requestId)
            .select()
            .single()

        if (!error && data) {
            set({ activeRequest: null })

            // Re-enable driver availability in profiles
            const { user } = useAuthStore.getState()
            if (user) {
                await supabase
                    .from('profiles')
                    .update({ is_available: true })
                    .eq('id', user.id)
            }
        }
        set({ loading: false })
        return { data, error }
    },

    // Setup Realtime Subscription
    subscribeToRequests: (role, userId) => {
        let filter = undefined
        if (role === 'driver' && userId) {
            filter = `driver_id=eq.${userId}`
        }

        const subscription = supabase
            .channel('public:emergency_requests')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'emergency_requests',
                    ...(filter ? { filter } : {})
                },
                (payload) => {
                    if (role === 'user') {
                        // Bystanders active request update
                        set({ activeRequest: payload.new })
                    } else if (role === 'driver') {
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            // If a request was assigned to this driver, add/update it
                            set((state) => {
                                const exists = state.pendingRequests.find(r => r.id === payload.new.id)
                                if (exists) {
                                    return { pendingRequests: state.pendingRequests.map(r => r.id === payload.new.id ? payload.new : r) }
                                } else {
                                    return { pendingRequests: [payload.new, ...state.pendingRequests] }
                                }
                            })
                        } else if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && payload.new.status === 'resolved')) {
                            // Request removed or resolved
                            set((state) => ({ pendingRequests: state.pendingRequests.filter(req => req.id !== payload.old.id) }))
                        }
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }
}))
