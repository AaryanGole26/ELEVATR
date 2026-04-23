import { createClient } from "@supabase/supabase-js";
import { assertServerEnv, env } from "@/shared/env";

assertServerEnv();

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});