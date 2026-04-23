import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { generateInterviewConfig } from "@/ai/interviewer/engine";
import { sendEmail } from "@/shared/email";
import { env } from "@/shared/env";
import { generateInterviewToken } from "@/shared/interview-security";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = (error as { message?: string }).message || "";
  return message.includes(`Could not find the '${column}' column`);
}

function parseManualEmails(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  return text
    .split(/[\n,;]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function normalizeInterviewNumber(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function buildInterviewLink(interviewId: string, token?: string | null): string {
  if (token && token.trim().length > 0) {
    return `${env.appUrl}/video-interview/${interviewId}?token=${token}`;
  }
  return `${env.appUrl}/video-interview/${interviewId}`;
}

function isUsableInterviewLink(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "pending") {
    return false;
  }
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/");
}

function generateTemporaryPassword(): string {
  const suffix = Math.random().toString(36).slice(-6);
  return `Elevatr@${suffix}A1`;
}

function isAlreadyRegisteredError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = ((error as { message?: string }).message || "").toLowerCase();
  return message.includes("already registered") || message.includes("already exists");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:notify:${ip}`, 5, 60000)) {
      throw new APIError(429, "Too many notification requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: pipelineId } = await context.params;
    const body = await parseRequestBody(request).catch(() => ({}));
    const manualEmails = parseManualEmails(typeof body?.manual_emails_text === "string" ? body.manual_emails_text : undefined);
    const inlineEmails = (body?.inline_emails && typeof body.inline_emails === "object") ? body.inline_emails : {};
    const interviewQuestionCount = normalizeInterviewNumber(body?.interview_questions, 8, 1, 30);
    const interviewDurationMinutes = normalizeInterviewNumber(body?.interview_minutes, 20, 1, 180);

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, hr_id, title, jd_text, threshold")
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .maybeSingle();

    if (pipelineErr) {
      throw new APIError(500, "Failed to load pipeline", { details: pipelineErr.message });
    }

    if (!pipeline) {
      throw new APIError(404, "Pipeline not found.");
    }

    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, candidate_id, resume_id, status, score")
      .eq("pipeline_id", pipelineId);

    if (appErr) {
      throw new APIError(500, "Failed to load applications", { details: appErr.message });
    }

    const appRows = applications || [];
    if (appRows.length === 0) {
      return apiResponse(true, { notified: 0, interview_links_sent: 0, skipped: 0 }, "No applications to notify", 200);
    }

    const resumeIds = Array.from(new Set(appRows.map((a) => a.resume_id).filter(Boolean)));
    const candidateIds = Array.from(new Set(appRows.map((a) => a.candidate_id).filter(Boolean)));

    const { data: resumes } = await supabaseAdmin
      .from("resumes")
      .select("id, content, metadata")
      .in("id", resumeIds);

    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .in("id", candidateIds as string[]);

    const resumeMap = new Map((resumes || []).map((r) => [r.id, r]));
    const userEmailMap = new Map((users || []).map((u) => [u.id, u.email]));
    const userIdByEmailMap = new Map((users || []).map((u) => [u.email.toLowerCase(), u.id]));

    let notified = 0;
    let attempted = 0;
    let interviewLinksSent = 0;
    let dashboardAccountsCreated = 0;
    let skipped = 0;
    const failures: Array<{ application_id: string; reason: string }> = [];
    const sentTo: Array<{
      application_id: string;
      email: string;
      status: string;
      source: "dashboard" | "resume-metadata" | "manual";
      interview_link?: string;
      account_created?: boolean;
    }> = [];
    let manualEmailIndex = 0;

    for (const app of appRows) {
      try {
        const resume = resumeMap.get(app.resume_id);
        const resumeMetadata = resume?.metadata && typeof resume.metadata === "object" ? (resume.metadata as Record<string, unknown>) : null;
        const resumeMetadataEmail = typeof resumeMetadata?.email === "string" ? resumeMetadata.email.toLowerCase() : null;
        
        const inlineEmailOverride = typeof inlineEmails[app.id] === 'string' && inlineEmails[app.id].trim().length > 0
          ? inlineEmails[app.id].trim().toLowerCase()
          : null;

        const existingEmail =
          inlineEmailOverride ||
          (app.candidate_id ? userEmailMap.get(app.candidate_id) : null) ||
          resumeMetadataEmail ||
          null;

        // If HR provided a 1-to-1 list, always use the corresponding manual email as fallback
        // but never override a better source (dashboard/resume)
        let manualEmail = null;
        if (manualEmails.length === appRows.length) {
          manualEmail = manualEmails[manualEmailIndex] || null;
          manualEmailIndex++; // Always advance in 1-to-1 mode
        } else if (!existingEmail) {
          // Gap-filling mode: only consume if needed
          manualEmail = manualEmails[manualEmailIndex] || null;
          if (manualEmail) manualEmailIndex++;
        }

        const candidateEmail = existingEmail || manualEmail;

        if (!candidateEmail) {
          skipped += 1;
          continue;
        }

        attempted += 1;
        const normalizedCandidateEmail = candidateEmail.toLowerCase();
        const pipelineThreshold = typeof pipeline.threshold === "number" ? pipeline.threshold : 70;
        const currentScore = typeof app.score === "number" ? app.score : 0;
        
        let currentStatus = (app.status || "screened").toLowerCase();
        if (currentStatus === "screened" && currentScore < pipelineThreshold) {
          currentStatus = "rejected";
          await supabaseAdmin.from("applications").update({ status: "rejected" }).eq("id", app.id);
        }

        const isShortlisted = ["shortlisted", "interview", "selected"].includes(currentStatus);
        const isRejected = currentStatus === "rejected";

        let dashboardUserId = app.candidate_id || userIdByEmailMap.get(normalizedCandidateEmail) || null;
        let createdCredentials: { email: string; password: string } | null = null;

        if (!dashboardUserId) {
          // Check if user already exists in public.users
          const { data: existingPublicUser } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", normalizedCandidateEmail)
            .maybeSingle();

          if (existingPublicUser?.id) {
            dashboardUserId = existingPublicUser.id;
          } else {
            // Attempt to create new Auth user
            const tempPassword = generateTemporaryPassword();
            const { data: createdAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
              email: normalizedCandidateEmail,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { role: "candidate" }
            });

            if (createUserError) {
              if (isAlreadyRegisteredError(createUserError)) {
                // User exists in Auth but not in public.users yet (possibly)
                // We'll need their ID to upsert. Since we can't easily get ID from Auth by email without listUsers,
                // we'll attempt an upsert with email if the schema allows, or use listUsers.
                const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
                const authUser = listData?.users?.find(u => u.email?.toLowerCase() === normalizedCandidateEmail);
                if (authUser?.id) {
                  dashboardUserId = authUser.id;
                }
              } else {
                throw new Error(createUserError.message || "Failed to create dashboard account");
              }
            } else if (createdAuthUser?.user?.id) {
              dashboardUserId = createdAuthUser.user.id;
              dashboardAccountsCreated += 1;
              createdCredentials = {
                email: normalizedCandidateEmail,
                password: tempPassword
              };
            }
          }

          if (dashboardUserId) {
            await supabaseAdmin.from("users").upsert({
              id: dashboardUserId,
              email: normalizedCandidateEmail,
              role: "candidate"
            }, { onConflict: "id" });

            userIdByEmailMap.set(normalizedCandidateEmail, dashboardUserId);
            await supabaseAdmin.from("applications").update({ candidate_id: dashboardUserId }).eq("id", app.id);
            await supabaseAdmin.from("resumes").update({ user_id: dashboardUserId }).eq("id", app.resume_id).is("user_id", null);
          }
        }

        if (isShortlisted) {
          let existingInterview: {
            id: string;
            interview_link: string | null;
            is_used?: boolean;
            interview_token?: string | null;
          } | null = null;
          const { data: interviewWithUsage, error: existingInterviewErr } = await supabaseAdmin
            .from("interviews")
            .select("*")
            .eq("application_id", app.id)
            .order("created_at", { ascending: false })
            .maybeSingle();

          if (existingInterviewErr && isMissingColumnError(existingInterviewErr, "is_used")) {
            const { data: interviewLegacy, error: legacyErr } = await supabaseAdmin
              .from("interviews")
              .select("id, interview_link")
              .eq("application_id", app.id)
              .order("created_at", { ascending: false })
              .maybeSingle();

            if (legacyErr) {
              throw new Error(legacyErr.message || "Failed to load existing interview record");
            }

            existingInterview = interviewLegacy;
          } else if (existingInterviewErr) {
            throw new Error(existingInterviewErr.message || "Failed to load existing interview record");
          } else {
            existingInterview = interviewWithUsage;
          }

          let interviewLink = existingInterview?.interview_link || "";
          const hasUsableExistingLink = isUsableInterviewLink(interviewLink);

          if (!existingInterview || !hasUsableExistingLink || existingInterview.is_used) {
            const token = generateInterviewToken(app.id);
            const config = generateInterviewConfig(
              pipeline.jd_text,
              resume?.content || "",
              interviewDurationMinutes,
              interviewQuestionCount
            );

            let interview: { id: string } | null = null;
            let linkToken: string | null = token;

            if (existingInterview && !existingInterview.is_used) {
              interview = { id: existingInterview.id };
              linkToken = existingInterview.interview_token || null;
              interviewLink = buildInterviewLink(existingInterview.id, linkToken);
              await supabaseAdmin
                .from("interviews")
                .update({ interview_link: interviewLink })
                .eq("id", existingInterview.id);
            } else {
              const { data: interviewWithToken, error: interviewWithTokenErr } = await supabaseAdmin
                .from("interviews")
                .insert({
                  application_id: app.id,
                  config,
                  interview_token: token,
                  interview_link: "pending"
                })
                .select("id")
                .single();

              if (interviewWithTokenErr && isMissingColumnError(interviewWithTokenErr, "interview_token")) {
                const { data: interviewLegacy, error: interviewLegacyErr } = await supabaseAdmin
                  .from("interviews")
                  .insert({
                    application_id: app.id,
                    config,
                    interview_link: "pending"
                  })
                  .select("id")
                  .single();

                if (interviewLegacyErr || !interviewLegacy) {
                  throw new Error(interviewLegacyErr?.message || "Failed to create interview record");
                }

                interview = interviewLegacy;
                linkToken = null;
              } else if (interviewWithTokenErr || !interviewWithToken) {
                throw new Error(interviewWithTokenErr?.message || "Failed to create interview record");
              } else {
                interview = interviewWithToken;
              }

              interviewLink = buildInterviewLink(interview.id, linkToken);
              await supabaseAdmin
                .from("interviews")
                .update({ interview_link: interviewLink })
                .eq("id", interview.id);
            }
          }

          const credentialsHtml = createdCredentials
            ? `
              <hr />
              <p><strong>Your candidate dashboard account was created automatically.</strong></p>
              <p>Username: <strong>${createdCredentials.email}</strong></p>
              <p>Temporary Password: <strong>${createdCredentials.password}</strong></p>
              <p>Please log in and change your password after first sign-in.</p>
            `
            : "";

          const emailResult = await sendEmail({
            to: candidateEmail,
            subject: `You are shortlisted for ${pipeline.title}`,
            html: `
              <h2>Great news! You are shortlisted.</h2>
              <p>Your application has been shortlisted for <strong>${pipeline.title}</strong>.</p>
              <p>Interview setup: <strong>${interviewQuestionCount} questions</strong> and <strong>${interviewDurationMinutes} minutes</strong>.</p>
              <p>Please complete your video interview using the secure link below:</p>
              <p><a href="${interviewLink}" style="padding:10px 16px;background:#0b6dff;color:#fff;text-decoration:none;border-radius:6px;">Start Video Interview</a></p>
              <p>This link is secured for a one-time interview session.</p>
              ${credentialsHtml}
            `
          });

          if (emailResult.skipped) {
            skipped += 1;
            continue;
          }

          interviewLinksSent += 1;
          notified += 1;
          sentTo.push({
            application_id: app.id,
            email: candidateEmail,
            status: currentStatus,
            source: dashboardUserId ? "dashboard" : "manual",
            interview_link: interviewLink,
            account_created: !!createdCredentials
          });
        } else if (isRejected) {
          const emailResult = await sendEmail({
            to: candidateEmail,
            subject: `Update regarding your application for ${pipeline.title}`,
            html: `
              <h2>Thank you for your interest</h2>
              <p>Hello,</p>
              <p>We appreciate the time and effort you put into your application for the <strong>${pipeline.title}</strong> role.</p>
              <p>After careful review of your profile against our current requirements, we regret to inform you that we will not be moving forward with your application at this time.</p>
              <p>We will keep your resume in our database for future opportunities that may be a better match for your skills.</p>
              <p>Regards,<br />The Hiring Team</p>
            `
          });

          if (!emailResult.skipped) {
            notified += 1;
            sentTo.push({
              application_id: app.id,
              email: candidateEmail,
              status: "rejected",
              source: dashboardUserId ? "dashboard" : "manual",
              account_created: !!createdCredentials
            });
          } else {
            skipped += 1;
          }
        } else {
          const emailResult = await sendEmail({
            to: candidateEmail,
            subject: `Application update for ${pipeline.title}`,
            html: `
              <h2>Application Update</h2>
              <p>Thank you for applying to <strong>${pipeline.title}</strong>.</p>
              <p>Your application status is currently: <strong>${currentStatus}</strong>.</p>
              <p>We are still reviewing applications and will keep you informed of any updates.</p>
              <p>Regards,<br />The Hiring Team</p>
            `
          });

          if (!emailResult.skipped) {
            notified += 1;
            sentTo.push({
              application_id: app.id,
              email: candidateEmail,
              status: currentStatus,
              source: dashboardUserId ? "dashboard" : "manual",
              account_created: !!createdCredentials
            });
          } else {
            skipped += 1;
          }
        }
      } catch (err) {
        failures.push({
          application_id: app.id,
          reason: err instanceof Error ? err.message : "Unknown email/notification error"
        });
      }
    }

    return apiResponse(
      true,
      {
        pipeline_id: pipeline.id,
        total_applications: appRows.length,
        attempted,
        notified,
        interview_links_sent: interviewLinksSent,
        dashboard_accounts_created: dashboardAccountsCreated,
        skipped,
        sent_to: sentTo,
        interview_defaults: {
          questions: interviewQuestionCount,
          duration_minutes: interviewDurationMinutes
        },
        failures
      },
      "Candidate notifications processed",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
