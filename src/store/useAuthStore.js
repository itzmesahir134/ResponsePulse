import { create } from 'zustand'
import { supabase } from '../services/supabase'

export const useAuthStore = create((set, get) => ({
    user: null,
    profile: null,
    isAuthLoading: true,

    initialize: async () => {
        console.log("Auth: Initializing deterministic lifecycle...")

        // 1. Get initial session immediately
        const { data: { session } } = await supabase.auth.getSession()
        const initialUser = session?.user || null

        if (initialUser) {
            await get().ensureProfile(initialUser)
        } else {
            set({ user: null, profile: null, isAuthLoading: false })
            console.log("Auth: No initial session found.")
        }

        // 2. Listen for future auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            const user = session?.user || null
            console.log(`Auth Event: ${event}`, user?.id)

            if (user) {
                await get().ensureProfile(user)
            } else {
                set({ user: null, profile: null, isAuthLoading: false })
            }
        })
    },

    ensureProfile: async (user) => {
        // Don't re-lock if we're already loading or already have this user's profile
        // unless we explicitly need to refresh.
        // But for safety during init, we lock.
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle()

            if (profile) {
                set({ user, profile, isAuthLoading: false })
                console.log("Auth: Profile resolved (exists)")
            } else {
                console.log("Auth: Profile missing, auto-provisioning...")
                const newProfile = {
                    id: user.id,
                    role: user.user_metadata?.role || 'driver',
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Medical Unit',
                    is_available: false,
                    latitude: null,
                    longitude: null
                }

                const { data: createdProfile, error: createError } = await supabase
                    .from('profiles')
                    .insert([newProfile])
                    .select()
                    .maybeSingle()

                if (createError) throw createError
                set({ user, profile: createdProfile, isAuthLoading: false })
                console.log("Auth: Profile resolved (created)")
            }
        } catch (err) {
            console.error("Auth: Direct profile resolution failed:", err)
            set({ user, isAuthLoading: false })
        }
    },

    signUp: async (email, password, fullName, role) => {
        set({ isAuthLoading: true })
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    role: role
                }
            }
        })
        if (error) set({ isAuthLoading: false })
        return { data, error }
    },

    signIn: async (email, password) => {
        set({ isAuthLoading: true })
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (error) throw error
            // ensureProfile will be handled by onAuthStateChange
            return { data, error: null }
        } catch (error) {
            set({ isAuthLoading: false })
            return { data: null, error }
        }
    },

    signOut: async () => {
        set({ isAuthLoading: true })
        await supabase.auth.signOut()
        set({ user: null, profile: null, isAuthLoading: false })
    },

    updateAvailability: async (status) => {
        const userId = get().user?.id
        if (!userId) return

        const { error } = await supabase
            .from('profiles')
            .update({ is_available: status })
            .eq('id', userId)

        if (!error) {
            set((state) => ({ profile: { ...state.profile, is_available: status } }))
        }
    },

    updateLocation: async (lat, lng) => {
        const userId = get().user?.id
        if (!userId) return

        await supabase
            .from('profiles')
            .update({ latitude: lat, longitude: lng })
            .eq('id', userId)

        set((state) => ({ profile: { ...state.profile, latitude: lat, longitude: lng } }))
    }
}))
