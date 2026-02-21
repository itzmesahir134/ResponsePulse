import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
    console.log("Testing Supabase connectivity...")
    const start = Date.now()
    try {
        const { data, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        if (error) {
            console.error("Supabase Error:", error)
        } else {
            console.log("Supabase Success!")
        }
    } catch (e) {
        console.error("Exception:", e)
    }
    console.log("Time taken:", Date.now() - start, "ms")
    process.exit(0)
}

test()
