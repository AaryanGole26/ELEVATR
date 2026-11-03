import crypto from "crypto";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { generateInterviewConfig } from "@/ai/interviewer/engine";
import { sendEmail } from "@/shared/email";
import { interviewInviteEmail, screeningRejectionEmail, statusUpdateEmail } from "@/shared/email-templates";
import { env } from "@/shared/env";
import { generateInterviewExpiry, generateInterviewToken, INTERVIEW_LINK_TTL_HOURS, isExpired } from "@/shared/interview-security";
import { APIError, apiResponse, apiError, assertUuid, rateLimit, parseRequestBody, getClientIp } from "@/shared/api-utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Past these stages there is nothing to notify about here: results go out through finalization.
const AFTER_INTERVIEW = new Set(["interviewed", "selected"]);

function parseManualEmails(text: unknown): string[] {
  if (typeof text !== "string") return [];
  return text
    .split(/[\n,;]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => EMAIL_PATTERN.test(item));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function buildInterviewLink(interviewId: string, token: string) {
  return `${env.appUrl}/video-interview/${interviewId}?token=${token}`;
}

/**
 * Links a batch-uploaded resume to an account, creating one when needed. New accounts receive a
 * one-time "set your password" link rather than a password sent in plain text by email.
 */
async function resolveCandidateAccount(email: string) {
  const { data: existing } = await supabaseAdmin.from("users").select("id").eq("email", email).maybeSingle();
  if (existing?.id) return { userId: existing.id as string, setPasswordLink: null, created: false };

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { role: "candidate" }
  });
  if (error || !created?.user) throw new Error(error?.message || "Failed to create candidate account");

  // The database trigger normally creates this row; this covers a database without the trigger.
  await supabaseAdmin
    .from("users")
    .upsert({ id: created.user.id, email, role: "candidate" }, { onConflict: "id", ignoreDuplicates: true });

  const { data: link } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = link?.properties?.hashed_token;

  return {
    userId: created.user.id,
    // Verified by the reset page, so the link works in any browser the candidate opens it in.
    setPasswordLink: tokenHash ? `${env.appUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery` : null,
    created: true
  };
}

/** Returns a usable link for this application, reusing an open interview where possible. */
async function ensureInterview(params: {
  applicationId: string;
  jdText: string;
  resumeText: string;
  minutes: number;
  questions: number;
}) {
  const { data: rows, error } = await supabaseAdmin
    .from("interviews")
    .select("id, interview_token, expires_at, is_used")
    .eq("application_id", params.applicationId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const latest = rows?.[0];
  const config = generateInterviewConfig(params.jdText, params.resumeText, params.minutes, params.questions);

  if (latest && !latest.is_used) {
    const token = latest.interview_token || generateInterviewToken();
    const expires_at = !latest.expires_at || isExpired(latest.expires_at) ? generateInterviewExpiry() : latest.expires_at;
    const link = buildInterviewLink(latest.id, token);
    const { error: updateError } = await supabaseAdmin
      .from("interviews")
      .update({ interview_token: token, expires_at, interview_link: link, config })
      .eq("id", latest.id);
    if (updateError) throw new Error(updateError.message);
    return link;
  }

  const token = generateInterviewToken();
  const { data: created, error: insertError } = await supabaseAdmin
    .from("interviews")
    .insert({
      application_id: params.applicationId,
      config,
      interview_token: token,
      expires_at: generateInterviewExpiry(),
      interview_status: "pending"
    })
    .select("id")
    .single();
  if (insertError || !created) throw new Error(insertError?.message || "Failed to create interview");

  const link = buildInterviewLink(created.id, token);
  await supabaseAdmin.from("interviews").update({ interview_link: link }).eq("id", created.id);
  return link;
}

/**
 * POST /api/pipelines/[id]/notify
 * Moves each candidate to their next stage and emails them. Safe to press repeatedly: a candidate
 * already told about their current status is skipped unless `resend` is true.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`pipeline:notify:${getClientIp(request)}`, 5, 60_000)) {
      throw new APIError(429, "Too many notification requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const { id: pipelineId } = await context.params;
    assertUuid(pipelineId, "Pipeline");

    const body = await parseRequestBody(request).catch(() => ({}));
    const manualEmails = parseManualEmails(body?.manual_emails_text);
    const inlineEmails: Record<string, unknown> = body?.inline_emails && typeof body.inline_emails === "object" ? body.inline_emails : {};
    const questions = clampNumber(body?.interview_questions, 8, 1, 30);
    const minutes = clampNumber(body?.interview_minutes, 20, 1, 180);
    const resend = body?.resend === true;

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, jd_text, threshold")
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .maybeSingle();

    if (pipelineErr) throw new APIError(500, "Failed to load pipeline", { details: pipelineErr.message });
    if (!pipeline) throw new APIError(404, "Pipeline not found.");

    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, candidate_id, resume_id, status, score, email, last_notified_status, users!candidate_id(email), resumes(content, parsed_content, metadata)")
      .eq("pipeline_id", pipelineId)
      .order("created_at", { ascending: true });

    if (appErr) throw new APIError(500, "Failed to load applications", { details: appErr.message });

    let notified = 0;
    let attempted = 0;
    let interviewLinksSent = 0;
    let accountsCreated = 0;
    let skipped = 0;
    let alreadyNotified = 0;
    let unsentNoEmailService = 0;
    let manualIndex = 0;
    const failures: Array<{ application_id: string; reason: string }> = [];
    const sentTo: Array<{ application_id: string; email: string; status: string; interview_link?: string; email_sent: boolean }> = [];
    const missingEmail: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const app of (applications || []) as any[]) {
      try {
        const status: string = app.status || "screened";
        if (AFTER_INTERVIEW.has(status)) {
          skipped += 1;
          continue;
        }

        const resume = Array.isArray(app.resumes) ? app.resumes[0] : app.resumes;
        const account = Array.isArray(app.users) ? app.users[0] : app.users;
        const inlineOverride = typeof inlineEmails[app.id] === "string" ? (inlineEmails[app.id] as string).trim().toLowerCase() : "";

        let email: string | null =
          (EMAIL_PATTERN.test(inlineOverride) ? inlineOverride : null) ||
          account?.email?.toLowerCase() ||
          app.email?.toLowerCase() ||
          (typeof resume?.metadata?.email === "string" ? resume.metadata.email.toLowerCase() : null);

        if (!email && manualIndex < manualEmails.length) {
          email = manualEmails[manualIndex];
          manualIndex += 1;
        }

        if (!email) {
          skipped += 1;
          missingEmail.push(app.id);
          continue;
        }

        // Work out where this candidate goes next from their stage and screening score.
        const score = typeof app.score === "number" ? app.score : 0;
        let nextStatus = status;
        if (status === "screened" || status === "pending") {
          nextStatus = score >= pipeline.threshold ? "shortlisted" : "rejected";
        }
        const invite = nextStatus === "shortlisted" || nextStatus === "interview";
        const targetStatus = invite ? "interview" : nextStatus;

        if (!resend && app.last_notified_status === targetStatus) {
          alreadyNotified += 1;
          continue;
        }

        attempted += 1;

        let candidateId: string | null = app.candidate_id;
        let setPasswordLink: string | null = null;
        if (!candidateId) {
          const accountResult = await resolveCandidateAccount(email);
          candidateId = accountResult.userId;
          setPasswordLink = accountResult.setPasswordLink;
          if (accountResult.created) accountsCreated += 1;
          const { error: linkErr } = await supabaseAdmin.from("applications").update({ candidate_id: candidateId }).eq("id", app.id);
          if (linkErr) throw new Error(linkErr.message);
          await supabaseAdmin.from("resumes").update({ user_id: candidateId }).eq("id", app.resume_id).is("user_id", null);
        }

        let interviewLink: string | undefined;
        let message;
        if (invite) {
          interviewLink = await ensureInterview({
            applicationId: app.id,
            jdText: pipeline.jd_text,
            resumeText: resume?.parsed_content || resume?.content || "",
            minutes,
            questions
          });
          message = interviewInviteEmail({
            pipelineTitle: pipeline.title,
            questions,
            minutes,
            link: interviewLink,
            expiresInHours: INTERVIEW_LINK_TTL_HOURS,
            setPasswordLink
          });
        } else if (nextStatus === "rejected") {
          message = screeningRejectionEmail(pipeline.title);
        } else {
          message = statusUpdateEmail(pipeline.title, nextStatus);
        }

        const emailResult = await sendEmail({ to: email, ...message });
        const delivered = !emailResult.skipped;

        // Without an email service the stage still advances, and HR gets the link to share by hand.
        const { error: updateErr } = await supabaseAdmin
          .from("applications")
          .update({
            status: targetStatus,
            email,
            ...(delivered ? { last_notified_status: targetStatus, last_notified_at: new Date().toISOString() } : {})
          })
          .eq("id", app.id);
        if (updateErr) throw new Error(updateErr.message);

        if (delivered) notified += 1;
        else unsentNoEmailService += 1;
        if (delivered && invite) interviewLinksSent += 1;

        sentTo.push({ application_id: app.id, email, status: targetStatus, interview_link: interviewLink, email_sent: delivered });
      } catch (err) {
        console.error(`[Notify] Application ${app.id} failed:`, err);
        failures.push({ application_id: app.id, reason: "Could not process this candidate. Please try again." });
      }
    }

    return apiResponse(
      true,
      {
        pipeline_id: pipeline.id,
        total_applications: (applications || []).length,
        attempted,
        notified,
        interview_links_sent: interviewLinksSent,
        dashboard_accounts_created: accountsCreated,
        skipped,
        already_notified: alreadyNotified,
        unsent_no_email_service: unsentNoEmailService,
        missing_email: missingEmail,
        sent_to: sentTo,
        interview_defaults: { questions, duration_minutes: minutes },
        failures
      },
      "Candidate notifications processed"
    );
  } catch (error) {
    return apiError(error);
  }
}
