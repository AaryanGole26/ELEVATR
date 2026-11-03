import { createClient } from "@supabase/supabase-js";
import { assertServerEnv, env } from "@/shared/env";

assertServerEnv();

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  // Next.js caches fetch() in server routes by default, which served stale rows from the database.
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) }
});