import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, getClientIp } from "@/shared/api-utils";
import { readInterviewScore, reportRoute } from "@/shared/interviews";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

/**
 * GET /api/applications/review
 * 
 * HR endpoint to get all applications across all their pipelines
 * with interview status and report URLs for dashboard display
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`application:review:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    // Get all pipelines for this HR
    const { data: pipelines, error: pipelinesErr } = await supabaseAdmin
      .from("pipelines")
      .select("id")
      .eq("hr_id", guard.user.id);

    if (pipelinesErr || !pipelines) {
      throw new APIError(500, "Failed to fetch pipelines");
    }

    const pipelineIds = pipelines.map((p) => p.id);

    if (pipelineIds.length === 0) {
      return apiResponse(true, { applications: [] }, "No applications found", 200);
    }

    // Get all applications in these pipelines
    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select(
        `
        id,
        pipeline_id,
        candidate_id,
        status,
        score,
        latest_interview_score,
        email,
        created_at,
        updated_at,
        pipelines!inner (
          id,
          title
        ),
        users!candidate_id (
          email
        ),
        interviews (
          id,
          report_pdf_url,
          result_json,
          created_at,
          completed_at,
          interview_status
        )
      `
      )
      .in("pipeline_id", pipelineIds)
      .order("created_at", { ascending: false });

    if (appErr || !applications) {
      throw new APIError(500, "Failed to fetch applications");
    }

    // Transform data for dashboard
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = (applications || []).map((app: any) => {
      const interviews = Array.isArray(app.interviews) ? app.interviews : [];
      const latestInterview = [...interviews].sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at))[0] ?? null;

      const userEmail = Array.isArray(app.users)
        ? app.users[0]?.email
        : app.users?.email;

      return {
        id: app.id,
        pipeline_id: app.pipeline_id,
        pipeline_title: app.pipelines?.title || "Unknown Pipeline",
        candidate_email: userEmail || app.email || "",
        status: app.status,
        screening_score: app.score,
        interview_completed: latestInterview?.interview_status === "completed",
        interview_score: app.latest_interview_score ?? readInterviewScore(latestInterview?.result_json),
        interview_id: latestInterview?.id || null,
        report_url: latestInterview?.report_pdf_url ? reportRoute(latestInterview.id, "hr") : null,
        interview_created_at: latestInterview?.created_at,
        interview_completed_at: latestInterview?.completed_at,
        application_created_at: app.created_at,
        updated_at: app.updated_at,
      };
    });

    return apiResponse(
      true,
      { applications: normalized },
      "Applications retrieved",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
