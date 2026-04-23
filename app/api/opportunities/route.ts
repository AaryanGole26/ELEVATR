import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit } from "@/shared/api-utils";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`opportunities:${ip}`, 40, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("candidate");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { data: pipelines, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, jd_text, threshold, tags, created_at")
      .order("created_at", { ascending: false });

    if (pipelineErr) {
      throw new APIError(500, "Failed to load opportunities", { details: pipelineErr.message });
    }

    const { data: myApplications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, status, created_at")
      .eq("candidate_id", guard.user.id);

    if (appErr) {
      throw new APIError(500, "Failed to load your application history", { details: appErr.message });
    }

    const applicationByPipeline = new Map((myApplications || []).map((app) => [app.pipeline_id, app]));

    const opportunities = (pipelines || []).map((pipeline) => {
      const existing = applicationByPipeline.get(pipeline.id);
      return {
        ...pipeline,
        applied: !!existing,
        application_id: existing?.id || null,
        application_status: existing?.status || null,
        applied_at: existing?.created_at || null
      };
    });

    return apiResponse(
      true,
      { opportunities },
      `Loaded ${opportunities.length} opportunities`,
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
