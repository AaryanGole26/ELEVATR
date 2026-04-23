import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Can be ignored from Server Components; middleware handles refresh.
        }
      }
    }
  });
};
