import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, apiResponse, assertUuid, getClientIp, rateLimit } from "@/shared/api-utils";
import { loadInterviewContext, toEvaluationView } from "@/shared/interviews";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

/** GET /api/interviews/[id]/details: the HR evaluation view, limited to the HR's own pipelines. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`interview:details:${getClientIp(request)}`, 60, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const { id: interviewId } = await context.params;
    assertUuid(interviewId, "Interview");

    const interview = await loadInterviewContext(interviewId);
    if (interview.pipeline.hr_id !== guard.user.id) throw new APIError(404, "Interview not found.");

    const { data: row } = await supabaseAdmin
      .from("interviews")
      .select("report_pdf_url")
      .eq("id", interviewId)
      .maybeSingle();

    return apiResponse(true, {
      evaluation: toEvaluationView({
        interviewId,
        resultJson: interview.result_json,
        hasReport: !!row?.report_pdf_url,
        candidateEmail: interview.candidateEmail,
        pipelineTitle: interview.pipeline.title
      })
    });
  } catch (error) {
    return apiError(error);
  }
}
