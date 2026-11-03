import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, getClientIp } from "@/shared/api-utils";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!rateLimit(`opportunities:${getClientIp(request)}`, 40, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("candidate");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const { data: myApplications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, status, created_at")
      .eq("candidate_id", guard.user.id);

    if (appErr) throw new APIError(500, "Failed to load your application history", { details: appErr.message });

    const applicationByPipeline = new Map((myApplications || []).map((app) => [app.pipeline_id, app]));

    const { data: pipelines, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, jd_text, threshold, tags, is_active, created_at")
      .order("created_at", { ascending: false });

    if (pipelineErr) throw new APIError(500, "Failed to load opportunities", { details: pipelineErr.message });

    // Closed positions stay visible only to candidates who already applied to them.
    const opportunities = (pipelines || [])
      .filter((pipeline) => pipeline.is_active || applicationByPipeline.has(pipeline.id))
      .map((pipeline) => {
        const existing = applicationByPipeline.get(pipeline.id);
        return {
          ...pipeline,
          applied: !!existing,
          application_id: existing?.id || null,
          application_status: existing?.status || null,
          applied_at: existing?.created_at || null
        };
      });

    return apiResponse(true, { opportunities }, `Loaded ${opportunities.length} opportunities`);
  } catch (error) {
    return apiError(error);
  }
}
