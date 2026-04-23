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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function initStorage() {
  console.log('Initializing Supabase Storage buckets...');
  
  // 1. Create 'resumes' bucket
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('Error listing buckets:', listError.message);
    return;
  }

  const resumesBucket = buckets.find(b => b.name === 'resumes');
  if (!resumesBucket) {
    console.log("Creating 'resumes' bucket (private)...");
    const { data, error } = await supabase.storage.createBucket('resumes', {
      public: false,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['application/pdf']
    });
    if (error) {
      console.error("Error creating 'resumes' bucket:", error.message);
    } else {
      console.log("'resumes' bucket created successfully.");
    }
  } else {
    console.log("'resumes' bucket already exists.");
  }

  // 2. Create 'reports' bucket
  const reportsBucket = buckets.find(b => b.name === 'reports');
  if (!reportsBucket) {
    console.log("Creating 'reports' bucket (public)...");
    const { data, error } = await supabase.storage.createBucket('reports', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['application/pdf']
    });
    if (error) {
      console.error("Error creating 'reports' bucket:", error.message);
    } else {
      console.log("'reports' bucket created successfully.");
    }
  } else {
    console.log("'reports' bucket already exists.");
  }

  console.log('Storage initialization complete.');
}

initStorage().catch(console.error);
