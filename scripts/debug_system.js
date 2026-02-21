import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
)

async function checkDrivers() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, role, is_available')
        .eq('role', 'driver')

    if (error) {
        console.log('Error:', error.message)
    } else {
        console.log('Total Drivers:', data.length)
        console.log(data)
    }
}

async function checkCurrentRequest() {
    const requestId = '449168d0-edac-4922-9e3a-2ebfb464d699'
    const { data, error } = await supabase
        .from('emergency_requests')
        .select('id, driver_id, status, latitude, longitude')
        .eq('id', requestId)
        .single()

    if (data) {
        console.log('--- Request ---')
        console.log(data)
        if (data.driver_id) {
            const { data: driver } = await supabase.from('profiles').select('id, is_available, latitude, longitude').eq('id', data.driver_id).single()
            console.log('--- Assigned Driver Status ---')
            console.log(driver)
        }
    }
}

checkDrivers().then(() => checkCurrentRequest())
