import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "./config";

export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { url, key } = getSupabaseConfig();

  const supabase = createServerClient(url, key, {
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

  try {
    // Refreshes an expired session so server code always sees a valid one.
    await supabase.auth.getUser();
  } catch (error) {
    // An auth outage must not take down public pages; protected routes still fail closed.
    console.error("[middleware] Session refresh failed:", error);
  }

  return response;
};
