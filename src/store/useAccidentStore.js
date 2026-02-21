import { create } from 'zustand'
import { supabase } from '../services/supabase'

export const useAccidentStore = create((set, get) => ({
    accidents: [],
    redZones: [],
    loading: false,

    fetchAccidents: async () => {
        set({ loading: true })
        const { data, error } = await supabase.from('accidents').select('*')
        if (!error && data) set({ accidents: data })
        set({ loading: false })
    },

    fetchRedZones: async () => {
        set({ loading: true })
        const { data, error } = await supabase.from('red_zones').select('*')
        if (!error && data) set({ redZones: data })
        set({ loading: false })
    },

    subscribeToRedZones: () => {
        const subscription = supabase
            .channel('public:red_zones')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'red_zones' },
                () => {
                    get().fetchRedZones()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }
}))
