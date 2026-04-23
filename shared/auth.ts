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

export async function getCurrentRole(userId: string): Promise<UserRole | null> {
  const { data, error } = await supabaseAdmin.from("users").select("role").eq("id", userId).maybeSingle();
  if (data?.role === "candidate" || data?.role === "hr") {
    return data.role as UserRole;
  }

  if (error) {
    console.warn("Falling back to auth metadata for role lookup:", error.message);
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return null;
  }

  const rawRole = userData.user.user_metadata?.role || "candidate";
  return rawRole === "candidate" || rawRole === "hr" ? rawRole : null;
}

async function ensurePublicUserRow(user: { id: string; email?: string | null; user_metadata?: { role?: unknown } }) {
  const role = user.user_metadata?.role || "candidate";
  if (role !== "candidate" && role !== "hr") {
    return null;
  }

  const email = user.email;
  if (!email) {
    return role as UserRole;
  }

  const { error } = await supabaseAdmin.from("users").upsert(
    {
      id: user.id,
      email,
      role
    },
    { onConflict: "id" }
  );

  if (error) {
    console.warn("Failed to backfill public.users row:", error.message);
  }

  return role as UserRole;
}

export async function requireRole(role: UserRole) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, status: 401, message: "Authentication required" };
  }

  const currentRole = (await getCurrentRole(user.id)) || (await ensurePublicUserRow(user));
  if (currentRole !== role) {
    return { ok: false as const, status: 403, message: "Forbidden for this role" };
  }

  return { ok: true as const, user };
}