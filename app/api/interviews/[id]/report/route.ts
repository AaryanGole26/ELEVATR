import { NextRequest, NextResponse } from "next/server";
import { getCurrentRole, getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, assertUuid, getClientIp, rateLimit } from "@/shared/api-utils";
import { loadInterviewContext, reportPath } from "@/shared/interviews";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

const SIGNED_URL_SECONDS = 300;

/**
 * GET /api/interviews/[id]/report?audience=hr|candidate
 * Redirects to a short-lived signed URL. HR can open either version for their own pipelines;
 * candidates can only open the candidate version of their own interview.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`interview:report:${getClientIp(request)}`, 30, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) throw new APIError(401, "Please sign in to view this report.");

    const { id: interviewId } = await context.params;
    assertUuid(interviewId, "Report");

    const audience = request.nextUrl.searchParams.get("audience") === "hr" ? "hr" : "candidate";
    const interview = await loadInterviewContext(interviewId);
    const role = await getCurrentRole(user);

    const isOwningHr = role === "hr" && interview.pipeline.hr_id === user.id;
    const isCandidate = interview.application.candidate_id === user.id;
    if (!(isOwningHr || (isCandidate && audience === "candidate"))) {
      // The same response as a missing report, so report ids can't be probed.
      throw new APIError(404, "Report not found.");
    }

    const { data, error } = await supabaseAdmin.storage
      .from("reports")
      .createSignedUrl(reportPath(interviewId, audience), SIGNED_URL_SECONDS);

    if (error || !data?.signedUrl) throw new APIError(404, "This report is not available yet.");

    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    return apiError(error);
  }
}
