import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase publishable/anon key");
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL format. Expected https://<project-ref>.supabase.co");
}

if (!parsedUrl.hostname.endsWith(".supabase.co")) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must point to a supabase.co host");
}

export const createClient = () => createBrowserClient(supabaseUrl, supabaseKey);
