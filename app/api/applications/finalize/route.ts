import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";
import { sendEmail } from "@/shared/email";

const finalizeSchema = z.object({
  candidates: z.array(
    z.object({
      application_id: z.string().uuid(),
      decision: z.enum(["selected", "rejected"]),
    })
  ),
});

/**
 * POST /api/applications/finalize
 * 
 * HR endpoint to finalize candidate decisions and send selection/rejection emails
 * Requires HR role
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`finalize:${ip}`, 10, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Auth check - HR only
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    // Parse request
    const body = await parseRequestBody(request);
    const parsed = finalizeSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid request data", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { candidates } = parsed.data;
    console.log(`[Finalize] Processing ${candidates.length} candidates...`);
    console.log("[Finalize] HR is finalizing candidate decisions and will send notifications");

    // Verify HR owns all pipelines
    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, candidate_id, latest_interview_score, pipelines!inner(hr_id), users!candidate_id(email)")
      .in("id", candidates.map((c) => c.application_id));

    if (appErr || !applications) {
      throw new APIError(500, "Failed to fetch applications");
    }

    // Verify HR owns all pipelines
    for (const app of applications) {
      const pipeline = Array.isArray(app.pipelines) ? app.pipelines[0] : (app.pipelines as Record<string, unknown>);
      if (!pipeline || (pipeline.hr_id as string) !== guard.user.id) {
        throw new APIError(403, "You don't have permission to finalize this application");
      }
    }

    // Update all applications
    const results = [];
    for (const candidate of candidates) {
      const app = applications.find((a) => a.id === candidate.application_id);
      if (!app) continue;

      const { error: updateErr } = await supabaseAdmin
        .from("applications")
        .update({
          status: candidate.decision,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.application_id);

      if (updateErr) {
        console.error(`Failed to update application ${candidate.application_id}:`, updateErr);
        continue;
      }

      // Send email notification
      const candidateEmail = Array.isArray(app.users)
        ? app.users[0]?.email
        : (app.users as Record<string, unknown>)?.email;

      const interviewScore = (app as Record<string, unknown>).latest_interview_score || 0;

      if (candidateEmail) {
        const subject =
          candidate.decision === "selected"
            ? "🎉 Congratulations! You've Been Selected - Next Steps"
            : "Interview Update - Thank You for Your Interest";

        const html =
          candidate.decision === "selected"
            ? `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #0a43ff;">🎉 Congratulations!</h2>
            <p>We're excited to inform you that you've been selected to move forward in our hiring process!</p>
            <div style="background-color: #f0f4ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Your Interview Score:</strong> ${interviewScore}/100</p>
              <p><strong>Status:</strong> Selected for Next Round</p>
            </div>
            <p>Our HR team will be in touch shortly with the next steps and timeline.</p>
            <p>Thank you for your interest in our opportunity and for taking the time to interview with us!</p>
            <hr />
            <p style="color: #666; font-size: 12px;">Best regards,<br />The ELEVATR Team</p>
          </div>
        `
            : `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #333;">Interview Decision</h2>
            <p>Thank you for taking the time to interview with us. We appreciate your effort and the insights you shared during the process.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Your Interview Score:</strong> ${interviewScore}/100</p>
              <p><strong>Status:</strong> Not Selected at This Time</p>
            </div>
            <p>After careful review, we've decided to move forward with other candidates whose profile more closely matched our current needs.</p>
            <p>We encourage you to apply for future opportunities that align with your skills and experience. We value your interest and wish you the best in your career journey.</p>
            <hr />
            <p style="color: #666; font-size: 12px;">Best regards,<br />The ELEVATR Team</p>
          </div>
        `;

        try {
          await sendEmail({
            to: candidateEmail,
            subject,
            html,
          });
        } catch (emailErr) {
          console.error(`Failed to send email to ${candidateEmail}:`, emailErr);
        }
      }

      results.push({
        application_id: candidate.application_id,
        decision: candidate.decision,
        email_sent: !!candidateEmail,
      });
    }

    return apiResponse(
      true,
      { finalized: results },
      `${results.length} candidates finalized`,
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
