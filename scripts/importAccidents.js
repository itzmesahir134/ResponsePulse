
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env file");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simple CSV parser that handles quotes correctly
function parseCSVLine(line) {
    const result = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(cell.trim());
            cell = '';
        } else {
            cell += char;
        }
    }
    result.push(cell.trim());
    return result;
}

async function importAccidents() {
    const csvPath = path.resolve(__dirname, '../../mumbai_dummy_accidents.csv');
    console.log(`\n🚀 Starting accident data import...`);
    console.log(`📂 Reading dataset from: ${csvPath}`);

    if (!fs.existsSync(csvPath)) {
        console.error("❌ Dataset file not found!");
        process.exit(1);
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const records = [];

    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length < 7) continue;

        const [city, location, date, time, latitude, longitude, severity] = parts;

        // Map severity to integer scale (1-5) used by the dashboard
        let severityInt = 3;
        if (severity.toLowerCase() === 'high') severityInt = 5;
        else if (severity.toLowerCase() === 'medium') severityInt = 3;
        else if (severity.toLowerCase() === 'low') severityInt = 1;

        // Construct valid ISO timestamp
        const timestampStr = `${date}T${time}:00Z`;

        records.push({
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            severity: severityInt,
            timestamp: timestampStr
        });
    }

    console.log(`📦 Prepared ${records.length} records. Beginning upload...`);

    const batchSize = 100;
    let successCount = 0;
    let errorOccurred = false;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        // Using upsert with the unique constraint specified in schema.sql
        const { error } = await supabase
            .from('accidents')
            .upsert(batch, { onConflict: 'latitude,longitude,timestamp' });

        if (error) {
            console.error(`\n❌ Error in batch ${i / batchSize + 1}:`, error.message);
            if (error.message.includes('row-level security')) {
                console.log("\n⚠️  ACCESS DENIED: Row-Level Security (RLS) is blocking the insertion.");
                console.log("👉 Please ensure you have applied the policies in 'supabase/schema.sql' to your Supabase project.");
                console.log("👉 You must grant 'insert' permissions to the 'anon' role or use a Service Role Key.");
            } else if (error.message.includes('unique_accident')) {
                console.log("ℹ️  Skipped duplicate records in this batch.");
            }
            errorOccurred = true;
            break;
        } else {
            successCount += batch.length;
            process.stdout.write(`\r✅ Uploaded ${successCount}/${records.length} records...`);
        }
    }

    if (!errorOccurred) {
        console.log("\n\n🎉 Import complete! All records successfully processed.");
    } else {
        console.log("\n\n⚠️  Import finished with issues. Check the messages above.");
    }
}

importAccidents();
