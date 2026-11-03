import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, apiResponse, assertUuid, getClientIp, rateLimit } from "@/shared/api-utils";
import { isExpired, tokensMatch } from "@/shared/interview-security";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

type InterviewLinkState = "ready" | "in_progress" | "completed" | "expired" | "closed";

/**
 * GET /api/interviews/[id]/public?token=...
 * Candidate entry point: a valid token is the credential. Returns only what the interview page
 * shows. A wrong token gets the same 404 as an unknown id, so ids can't be probed.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`interview:public:${getClientIp(request)}`, 60, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const { id: interviewId } = await context.params;
    assertUuid(interviewId, "Interview");
    const token = (request.nextUrl.searchParams.get("token") || "").trim();

    const { data: interview, error } = await supabaseAdmin
      .from("interviews")
      .select("id, application_id, interview_token, expires_at, is_used, interview_status, config, applications!inner(status, pipelines!inner(title))")
      .eq("id", interviewId)
      .maybeSingle();

    if (error) throw new APIError(500, "Failed to load interview", { details: error.message });

    if (!interview || !tokensMatch(token, interview.interview_token)) {
      throw new APIError(404, "This interview link is not valid. Please use the link from your email.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const application = interview.applications as any;
    const status = application?.status as string | undefined;

    let state: InterviewLinkState = "ready";
    if (interview.is_used || interview.interview_status === "completed") state = "completed";
    else if (status === "rejected") state = "closed";
    else if (isExpired(interview.expires_at)) state = "expired";
    else if (interview.interview_status === "in_progress") state = "in_progress";

    const config = (interview.config || {}) as { durationMinutes?: number; maxQuestions?: number };

    return apiResponse(true, {
      state,
      interview_id: interview.id,
      expires_at: interview.expires_at,
      pipeline_title: application?.pipelines?.title || "Interview",
      max_questions: config.maxQuestions ?? 8,
      duration_minutes: config.durationMinutes ?? 20
    });
  } catch (error) {
    return apiError(error);
  }
}
