import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit } from "@/shared/api-utils";

/**
 * GET /api/interviews/[id]/details
 * 
 * Fetches detailed interview results with HR-facing report URLs
 * HR only - verifies ownership via pipeline
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`interview:details:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Auth check - HR only
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: interviewId } = await context.params;

    // Fetch interview with full details
    const { data: interview, error: interviewErr } = await supabaseAdmin
      .from("interviews")
      .select(
        `
        id,
        application_id,
        config,
        result_json,
        report_pdf_url,
        interview_status,
        created_at,
        completed_at,
        applications!inner (
          id,
          pipeline_id,
          status,
          score,
          latest_interview_score,
          latest_report_pdf_url,
          candidate_id,
          pipelines!inner (
            id,
            hr_id,
            title,
            jd_text
          ),
          users!candidate_id (
            email
          )
        )
      `
      )
      .eq("id", interviewId)
      .single();

    if (interviewErr || !interview) {
      throw new APIError(404, "Interview not found");
    }

    // Verify HR owns the pipeline
    const application = interview.applications;
    const pipeline = application?.pipelines;

    if (!pipeline || pipeline.hr_id !== guard.user.id) {
      throw new APIError(403, "You don't have permission to view this interview");
    }

    // Extract user email safely
    const userEmail = Array.isArray(application?.users)
      ? application.users[0]?.email
      : (application?.users as any)?.email;

    // Build response with parsed evaluation data
    const resultJson = interview.result_json || {};

    return apiResponse(
      true,
      {
        interview: {
          id: interview.id,
          created_at: interview.created_at,
          completed_at: interview.completed_at,
          status: interview.interview_status || "pending",
          config: interview.config,
          result: {
            overall_score: resultJson.overall_score || resultJson.overallScore || 0,
            summary: resultJson.summary || "",
            strengths: resultJson.strengths || [],
            weaknesses: resultJson.weaknesses || [],
            kpis: resultJson.kpis || {},
            transcript: resultJson.transcript || [],
            questions_answered: resultJson.questions_answered || 0,
            max_questions: resultJson.max_questions || 0,
            proctor_violations: resultJson.proctor_violations || 0,
            ai_recommendation: resultJson.ai_recommendation || "pending",
          },
          report_urls: {
            hr: interview.report_pdf_url || "",
            candidate: resultJson.candidate_report_pdf_url || "",
          },
        },
        application: {
          id: application.id,
          status: application.status,
          score: application.score,
          latest_interview_score: application.latest_interview_score,
          candidate_email: userEmail || "",
        },
        pipeline: {
          id: pipeline.id,
          title: pipeline.title,
          jd_text: pipeline.jd_text,
        },
      },
      "Interview details retrieved",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
