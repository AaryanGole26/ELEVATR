import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, apiResponse, assertUuid, getClientIp, parseRequestBody, rateLimit } from "@/shared/api-utils";
import { hasValidServiceSecret, isExpired, tokensMatch } from "@/shared/interview-security";
import { evaluateAndStore, loadInterviewContext } from "@/shared/interviews";

const MAX_TRANSCRIPT_CHARS = 100_000;

const resultSchema = z.object({
  callback_token: z.string().min(1),
  transcript: z.string().trim().min(10, "Your response is too short.").max(MAX_TRANSCRIPT_CHARS, "Your response is too long."),
  questions_answered: z.number().int().min(0).max(100).optional(),
  max_questions: z.number().int().min(0).max(100).optional(),
  active_interview_seconds: z.number().int().min(0).optional(),
  proctor_violations: z.number().int().min(0).optional(),
  completion_reason: z.string().max(500).optional()
});

/**
 * POST /api/interviews/[id]/result
 * Records a finished interview. Two callers are allowed:
 *  - the interview service, authenticated by the shared secret, submitting a server-side transcript
 *  - a candidate using the written fallback, authenticated by their link token
 * Scores and decisions are never accepted from the caller. Only the evaluator produces them.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`interview:result:${getClientIp(request)}`, 10, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const { id: interviewId } = await context.params;
    assertUuid(interviewId, "Interview");

    const parsed = resultSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message || "Invalid interview submission");
    }
    const body = parsed.data;
    const fromService = hasValidServiceSecret(request);

    const { data: interview, error } = await supabaseAdmin
      .from("interviews")
      .select("id, interview_token, expires_at, is_used, applications!inner(status)")
      .eq("id", interviewId)
      .maybeSingle();

    if (error) throw new APIError(500, "Failed to load interview", { details: error.message });
    if (!interview || !tokensMatch(body.callback_token, interview.interview_token)) {
      throw new APIError(404, "This interview link is not valid.");
    }
    if (interview.is_used) throw new APIError(409, "This interview has already been submitted.");
    if (isExpired(interview.expires_at)) throw new APIError(410, "This interview link has expired.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((interview.applications as any)?.status === "rejected") {
      throw new APIError(403, "This interview link is no longer active.");
    }

    // Proctoring data can only be trusted from the service, never from the candidate's browser.
    const base: Record<string, unknown> = fromService
      ? {
          submission_type: "video",
          questions_answered: body.questions_answered ?? 0,
          max_questions: body.max_questions ?? 0,
          active_interview_seconds: body.active_interview_seconds ?? 0,
          proctor_violations: body.proctor_violations ?? 0,
          completion_reason: body.completion_reason ?? "Interview completed"
        }
      : { submission_type: "written", completion_reason: "Submitted through the written interview" };

    // Claim the interview atomically and save the transcript first, so a double submission loses
    // the race and a later evaluation failure can't lose the candidate's answers.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("interviews")
      .update({
        is_used: true,
        interview_status: "in_progress",
        result_json: { ...base, raw_transcript: body.transcript, evaluation_status: "failed" }
      })
      .eq("id", interviewId)
      .eq("is_used", false)
      .select("id")
      .maybeSingle();

    if (claimError) throw new APIError(500, "Failed to record interview", { details: claimError.message });
    if (!claimed) throw new APIError(409, "This interview has already been submitted.");

    const interviewContext = await loadInterviewContext(interviewId);

    try {
      const outcome = await evaluateAndStore(interviewContext, { transcript: body.transcript, base });
      return apiResponse(true, { evaluation_status: outcome.evaluationStatus }, "Interview recorded");
    } catch (processingError) {
      // The transcript is safe. Flag it for HR, who can retry from the pipeline page.
      console.error("[Result] Processing failed:", processingError);
      await supabaseAdmin.from("interviews").update({ interview_status: "failed" }).eq("id", interviewId);
      return apiResponse(true, { evaluation_status: "failed" }, "Interview recorded");
    }
  } catch (error) {
    return apiError(error);
  }
}
