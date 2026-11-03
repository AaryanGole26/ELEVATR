import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/shared/env";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, apiResponse, assertUuid, getClientIp, parseRequestBody, rateLimit } from "@/shared/api-utils";
import { isExpired, tokensMatch } from "@/shared/interview-security";
import { loadInterviewContext } from "@/shared/interviews";

const launchSchema = z.object({ token: z.string().min(1) });

/**
 * POST /api/interviews/[id]/launch
 * Hands the interview context to the interview service server-to-server, so the resume, callback
 * URL and service secret never pass through the candidate's browser.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`interview:launch:${getClientIp(request)}`, 20, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const { id: interviewId } = await context.params;
    assertUuid(interviewId, "Interview");

    const parsed = launchSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) throw new APIError(400, "Missing interview token.");

    const { data: interview, error } = await supabaseAdmin
      .from("interviews")
      .select("id, interview_token, expires_at, is_used, interview_status, config, applications!inner(status)")
      .eq("id", interviewId)
      .maybeSingle();

    if (error) throw new APIError(500, "Failed to load interview", { details: error.message });
    if (!interview || !tokensMatch(parsed.data.token, interview.interview_token)) {
      throw new APIError(404, "This interview link is not valid. Please use the link from your email.");
    }
    if (interview.is_used || interview.interview_status === "completed") {
      throw new APIError(410, "This interview has already been completed.");
    }
    if (isExpired(interview.expires_at)) {
      throw new APIError(410, "This interview link has expired. Please contact the hiring team for a new one.");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((interview.applications as any)?.status === "rejected") {
      throw new APIError(403, "This interview link is no longer active.");
    }

    if (!env.interviewServiceSecret) {
      throw new APIError(503, "The video interview service is not configured. Please use the written interview.");
    }

    const interviewContext = await loadInterviewContext(interviewId);
    const config = (interview.config || {}) as { durationMinutes?: number; maxQuestions?: number };

    let launchPath: string;
    try {
      const response = await fetch(`${env.interviewServiceUrl}/handoff-context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Elevatr-Service-Secret": env.interviewServiceSecret
        },
        body: JSON.stringify({
          interview_id: interviewId,
          job_title: interviewContext.pipeline.title,
          job_desc: interviewContext.pipeline.jd_text,
          resume_text: interviewContext.resumeText,
          resume_name: "resume",
          max_questions: config.maxQuestions ?? 8,
          time_limit_minutes: config.durationMinutes ?? 20,
          callback_url: `${env.internalAppUrl}/api/interviews/${interviewId}/result`,
          callback_token: parsed.data.token
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`Interview service responded with ${response.status}`);
      launchPath = (await response.json()).launch_url;
      if (typeof launchPath !== "string" || !launchPath.startsWith("/")) {
        throw new Error("Interview service returned no launch URL");
      }
    } catch (serviceError) {
      console.error("[Launch] Interview service unavailable:", serviceError);
      throw new APIError(503, "The video interview service is unavailable right now. You can try again shortly or use the written interview.");
    }

    await supabaseAdmin
      .from("interviews")
      .update({ interview_status: "in_progress" })
      .eq("id", interviewId)
      .eq("is_used", false);

    return apiResponse(true, { launch_url: `${env.interviewServicePublicUrl}${launchPath}` });
  } catch (error) {
    return apiError(error);
  }
}
