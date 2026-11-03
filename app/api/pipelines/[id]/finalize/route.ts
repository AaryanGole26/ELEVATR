import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { sendEmail } from "@/shared/email";
import { finalDecisionEmail } from "@/shared/email-templates";
import { readInterviewScore } from "@/shared/interviews";
import { APIError, apiError, apiResponse, assertUuid, parseRequestBody, rateLimit, getClientIp } from "@/shared/api-utils";

const finalizeSchema = z.object({
  mode: z.enum(["manual", "ai"]),
  selected_application_ids: z.array(z.string().uuid()).default([]),
  ai_cutoff_score: z.number().min(0).max(100).default(70),
  action: z.enum(["pass", "reject"]).default("pass")
});

/**
 * POST /api/pipelines/[id]/finalize
 * Manual mode applies the action to the chosen candidates. AI mode only considers candidates with
 * a real interview score: "pass" takes those at or above the cutoff, "reject" those below it.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!rateLimit(`pipeline:finalize:${getClientIp(request)}`, 10, 60_000)) {
      throw new APIError(429, "Too many finalization requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const parsed = finalizeSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) {
      throw new APIError(400, "Invalid finalization payload", { errors: parsed.error.flatten().fieldErrors });
    }

    const { id: pipelineId } = await context.params;
    assertUuid(pipelineId, "Pipeline");
    const { mode, selected_application_ids: chosenIds, ai_cutoff_score: cutoff, action } = parsed.data;
    const decision = action === "pass" ? "selected" : "rejected";

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title")
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .maybeSingle();

    if (pipelineErr) throw new APIError(500, "Failed to load pipeline", { details: pipelineErr.message });
    if (!pipeline) throw new APIError(404, "Pipeline not found");

    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, status, email, users!candidate_id(email), resumes(metadata), interviews(result_json, created_at)")
      .eq("pipeline_id", pipelineId);

    if (appErr) throw new APIError(500, "Failed to load applications", { details: appErr.message });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (applications || []) as any[];

    const scoreOf = (app: { interviews?: Array<{ result_json: unknown; created_at: string }> }) => {
      const latest = [...(app.interviews || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return readInterviewScore(latest?.result_json);
    };

    const chosen = new Set(chosenIds);
    const targets = rows.filter((app) => {
      // A decision that has already been sent is not repeated.
      if (app.status === decision) return false;
      if (mode === "manual") return chosen.has(app.id);
      const score = scoreOf(app);
      if (score === null) return false;
      return action === "pass" ? score >= cutoff : score < cutoff;
    });

    const selectedIds = targets.map((app) => app.id as string);

    if (selectedIds.length > 0) {
      const { error: statusErr } = await supabaseAdmin
        .from("applications")
        .update({ status: decision })
        .in("id", selectedIds);
      if (statusErr) throw new APIError(500, "Failed to update candidates", { details: statusErr.message });
    }

    let emailsSent = 0;
    let skipped = 0;
    const failures: Array<{ application_id: string; reason: string }> = [];

    for (const app of targets) {
      try {
        const account = Array.isArray(app.users) ? app.users[0] : app.users;
        const resume = Array.isArray(app.resumes) ? app.resumes[0] : app.resumes;
        const email = account?.email || app.email || resume?.metadata?.email || null;
        if (!email) {
          skipped += 1;
          continue;
        }

        const result = await sendEmail({ to: email, ...finalDecisionEmail(pipeline.title, decision) });
        if (result.skipped) {
          skipped += 1;
          continue;
        }

        emailsSent += 1;
        await supabaseAdmin
          .from("applications")
          .update({ last_notified_status: decision, last_notified_at: new Date().toISOString() })
          .eq("id", app.id);
      } catch (error) {
        console.error(`[Finalize] Email for ${app.id} failed:`, error);
        failures.push({ application_id: app.id, reason: "The decision was saved, but the email could not be sent." });
      }
    }

    return apiResponse(
      true,
      {
        mode,
        decision,
        selected_count: selectedIds.length,
        selected_ids: selectedIds,
        emails_sent: emailsSent,
        skipped,
        ai_cutoff_score: mode === "ai" ? cutoff : undefined,
        failures
      },
      "Candidate finalization completed"
    );
  } catch (error) {
    return apiError(error);
  }
}
