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

async function inspectRequest() {
    const requestId = '449168d0-edac-4922-9e3a-2ebfb464d699'
    const { data, error } = await supabase
        .from('emergency_requests')
        .select('status, driver_id')
        .eq('id', requestId)
        .single()

    if (error) {
        console.log('Error:', error.message)
    } else {
        console.log('Status:', data.status)
        console.log('Driver ID:', data.driver_id)
    }
}

inspectRequest()
