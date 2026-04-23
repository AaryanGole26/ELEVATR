const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '..', '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length === 2) {
    env[parts[0].trim()] = parts[1].trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugSchema() {
  console.log('Querying resumes table info...');
  
  // Try to select a single row to see column names
  const { data, error } = await supabase.from('resumes').select('*').limit(1);
  if (error) {
    console.error('Error querying resumes table:', error.message);
  } else if (data \u0026\u0026 data.length \u003e 0) {
    console.log('Columns found in resumes table:', Object.keys(data[0]));
  } else {
    console.log('Resumes table is empty. Trying to discover via PostgREST metadata...');
    // We can't easily query schema columns without raw SQL in Supabase via JS client
    // but we can try to guess or use RPC if it's there.
    // Or we can just insert a dummy record and see the error message.
  }
}

debugSchema().catch(console.error);
