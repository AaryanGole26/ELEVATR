import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, assertUuid, rateLimit, getClientIp } from "@/shared/api-utils";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

/** GET /api/opportunities/[id]: what the apply page needs. Row-level security correctly hides pipelines from candidates in the browser. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`opportunity:${getClientIp(request)}`, 60, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("candidate");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const { id } = await context.params;
    assertUuid(id, "Position");

    const { data: pipeline, error } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, jd_text, tags, is_active")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new APIError(500, "Failed to load position", { details: error.message });
    if (!pipeline) throw new APIError(404, "This position no longer exists.");

    const { data: existing } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("pipeline_id", id)
      .eq("candidate_id", guard.user.id)
      .maybeSingle();

    return apiResponse(true, { opportunity: { ...pipeline, applied: !!existing } });
  } catch (error) {
    return apiError(error);
  }
}
