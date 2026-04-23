import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit } from "@/shared/api-utils";

/**
 * GET /api/interviews/[id]/debug
 * 
 * DEBUG endpoint for HR to see raw interview data
 * HR only - shows result_json, timestamps, and all stored data
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`interview:debug:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Auth check - HR only
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: interviewId } = await context.params;

    // Fetch FULL interview record with all data
    const { data: interview, error: interviewErr } = await supabaseAdmin
      .from("interviews")
      .select("*")
      .eq("id", interviewId)
      .single();

    if (interviewErr || !interview) {
      throw new APIError(404, "Interview not found");
    }

    // Verify HR owns the pipeline
    const { data: application, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("pipeline_id, pipelines!inner(hr_id)")
      .eq("id", interview.application_id)
      .single();

    if (appErr || !application) {
      throw new APIError(404, "Application not found");
    }

    const pipeline = Array.isArray(application.pipelines)
      ? application.pipelines[0]
      : (application.pipelines as Record<string, unknown>);

    if (!pipeline || pipeline.hr_id !== guard.user.id) {
      throw new APIError(403, "You don't have permission to view this interview");
    }

    // Parse result_json to show structure
    const resultJson = interview.result_json || {};
    const debugInfo = {
      interview_id: interview.id,
      application_id: interview.application_id,
      is_used: interview.is_used,
      interview_status: interview.interview_status,
      created_at: interview.created_at,
      completed_at: interview.completed_at,
      has_result_json: !!interview.result_json,
      result_json_keys: Object.keys(resultJson),
      result_data: {
        overall_score: resultJson.overall_score || resultJson.overallScore || null,
        summary: resultJson.summary || null,
        strengths: resultJson.strengths || [],
        weaknesses: resultJson.weaknesses || [],
        kpis: resultJson.kpis || {},
        transcript_length: (resultJson.transcript || "").length,
        transcript_lines: Array.isArray(resultJson.transcript)
          ? resultJson.transcript.length
          : typeof resultJson.transcript === "string"
          ? resultJson.transcript.split("\n").length
          : 0,
        questions_answered: resultJson.questions_answered,
        max_questions: resultJson.max_questions,
        proctor_violations: resultJson.proctor_violations,
        ai_recommendation: resultJson.ai_recommendation || null,
        report_urls: resultJson.report_urls || null,
        candidate_report_pdf_url: resultJson.candidate_report_pdf_url || null,
      },
      report_pdf_url: interview.report_pdf_url || null,
      full_result_json: resultJson, // Full raw data for inspection
    };

    return apiResponse(
      true,
      debugInfo,
      "Interview debug data retrieved",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
