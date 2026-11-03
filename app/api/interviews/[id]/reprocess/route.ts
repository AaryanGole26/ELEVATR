import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { APIError, apiError, apiResponse, assertUuid, getClientIp, rateLimit } from "@/shared/api-utils";
import { evaluateAndStore, loadInterviewContext, readRawTranscript } from "@/shared/interviews";

/**
 * POST /api/interviews/[id]/reprocess
 * Re-runs the evaluation and reports from the saved transcript, for example after an AI outage.
 * It only uses the stored transcript: HR cannot rewrite what the candidate said.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`interview:reprocess:${getClientIp(request)}`, 5, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again in a minute.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const { id: interviewId } = await context.params;
    assertUuid(interviewId, "Interview");

    const interview = await loadInterviewContext(interviewId);
    if (interview.pipeline.hr_id !== guard.user.id) throw new APIError(404, "Interview not found.");

    const transcript = readRawTranscript(interview.result_json);
    if (transcript.trim().length <= 10) {
      throw new APIError(409, "This interview has no saved transcript to evaluate yet.");
    }

    const stored = interview.result_json || {};
    const base: Record<string, unknown> = {};
    for (const key of ["submission_type", "questions_answered", "max_questions", "active_interview_seconds", "proctor_violations", "completion_reason"]) {
      if (key in stored) base[key] = stored[key];
    }

    const outcome = await evaluateAndStore(interview, { transcript, base });

    return apiResponse(
      true,
      { interview_id: interviewId, score: outcome.score, evaluation_status: outcome.evaluationStatus },
      outcome.evaluationStatus === "complete"
        ? "Interview re-evaluated"
        : "The AI evaluation is still unavailable. Please try again later."
    );
  } catch (error) {
    return apiError(error);
  }
}
