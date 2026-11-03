import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody, getClientIp } from "@/shared/api-utils";
import { sendEmail } from "@/shared/email";
import { finalDecisionEmail } from "@/shared/email-templates";

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
    const ip = getClientIp(request);
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

    // Verify HR owns all pipelines
    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, candidate_id, email, pipelines!inner(hr_id, title), users!candidate_id(email)")
      .in("id", candidates.map((c) => c.application_id));

    if (appErr || !applications) {
      throw new APIError(500, "Failed to fetch applications");
    }

    // Verify HR owns all pipelines
    for (const app of applications) {
      const owner = (Array.isArray(app.pipelines) ? app.pipelines[0] : app.pipelines) as { hr_id?: string } | null;
      if (owner?.hr_id !== guard.user.id) {
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
        })
        .eq("id", candidate.application_id);

      if (updateErr) {
        console.error(`Failed to update application ${candidate.application_id}:`, updateErr);
        continue;
      }

      const account = Array.isArray(app.users) ? app.users[0] : app.users;
      const candidateEmail = (account as { email?: string } | null)?.email || app.email;
      const pipeline = (Array.isArray(app.pipelines) ? app.pipelines[0] : app.pipelines) as { title?: string };

      let emailSent = false;
      if (candidateEmail) {
        try {
          const result = await sendEmail({
            to: candidateEmail,
            ...finalDecisionEmail(pipeline?.title || "the position", candidate.decision)
          });
          emailSent = !result.skipped;
        } catch (emailErr) {
          console.error(`Failed to send decision email for ${candidate.application_id}:`, emailErr);
        }
      }

      results.push({
        application_id: candidate.application_id,
        decision: candidate.decision,
        email_sent: emailSent,
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
