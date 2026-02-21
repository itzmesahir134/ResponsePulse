import { supabase } from '../services/supabase'

// Utility to generate mock red zones for testing visualizations
export const seedRedZones = async () => {
    // Check if red_zones exist
    const { count } = await supabase.from('red_zones').select('*', { count: 'exact', head: true });

    if (count > 0) return; // Already seeded

    // Generate random red zones around a default coordinate (e.g., Delhi/Mumbai or user location)
    // We'll use a rough center (New Delhi for fallback)
    const baseLat = 28.6139;
    const baseLng = 77.2090;

    const mockZones = Array.from({ length: 5 }).map(() => ({
        center_lat: baseLat + (Math.random() - 0.5) * 0.1,
        center_lon: baseLng + (Math.random() - 0.5) * 0.1,
        radius: Math.floor(Math.random() * 500) + 200, // 200m to 700m
        risk_score: Math.floor(Math.random() * 50) + 50 // 50 to 100
    }));

    await supabase.from('red_zones').insert(mockZones);
    console.log("Mock Red Zones Seeded!");
}
