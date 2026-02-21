
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

async function checkData() {
    const requestId = '449168d0-edac-4922-9e3a-2ebfb464d699'

    const { data: request } = await supabase.from('emergency_requests').select('*').eq('id', requestId).single()

    if (!request) {
        console.log('REQ_NOT_FOUND');
        return;
    }

    console.log('REQ_ID:' + request.id);
    console.log('REQ_LAT:' + request.latitude);
    console.log('REQ_LNG:' + request.longitude);
    console.log('REQ_DRIVER:' + request.driver_id);

    if (request.driver_id) {
        const { data: driver } = await supabase.from('profiles').select('*').eq('id', request.driver_id).single();
        if (driver) {
            console.log('DRV_LAT:' + driver.latitude);
            console.log('DRV_LNG:' + driver.longitude);
        } else {
            console.log('DRV_NOT_FOUND');
        }
    }
}

checkData()
