import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/shared/supabase/admin";
import type { UserRole } from "@/shared/types";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

/**
 * public.users is the only source of truth for a role. user_metadata can be edited by the user
 * through the public auth API, so it is consulted once only: to create a missing row.
 */
export async function getCurrentRole(user: User): Promise<UserRole | null> {
  const { data, error } = await supabaseAdmin.from("users").select("role").eq("id", user.id).maybeSingle();

  if (error) {
    console.error("Role lookup failed:", error.message);
    return null;
  }

  if (data?.role === "candidate" || data?.role === "hr") {
    return data.role;
  }

  return ensurePublicUserRow(user);
}

async function ensurePublicUserRow(user: User): Promise<UserRole | null> {
  if (!user.email) return null;

  const role: UserRole = user.user_metadata?.role === "hr" ? "hr" : "candidate";
  const { error } = await supabaseAdmin.from("users").upsert(
    { id: user.id, email: user.email.toLowerCase(), role },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("Failed to create public.users row:", error.message);
    return null;
  }

  // Re-read in case a concurrent request (or the database trigger) created it first.
  const { data } = await supabaseAdmin.from("users").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "candidate" || data?.role === "hr" ? data.role : null;
}

export async function requireRole(role: UserRole) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, status: 401, message: "Authentication required" };
  }

  const currentRole = await getCurrentRole(user);
  if (currentRole !== role) {
    return { ok: false as const, status: 403, message: "Forbidden for this role" };
  }

  return { ok: true as const, user };
}
