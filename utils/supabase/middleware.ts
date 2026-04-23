import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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

export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  // This will refresh session if expired - necessary for Server Components to have a valid session
  await supabase.auth.getUser();

  return response;
};
