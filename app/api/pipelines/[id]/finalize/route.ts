import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { sendEmail } from "@/shared/email";
import { APIError, apiError, apiResponse, parseRequestBody, rateLimit } from "@/shared/api-utils";

const finalizeSchema = z.object({
  mode: z.enum(["manual", "ai"]),
  selected_application_ids: z.array(z.string().uuid()).default([]),
  ai_cutoff_score: z.number().min(0).max(100).default(70),
  action: z.enum(["pass", "reject"]).default("pass")
});

type ApplicationRow = {
  id: string;
  candidate_id: string | null;
  resume_id: string;
  status: string;
};

function parseScore(resultJson: unknown): number | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }

  const payload = resultJson as Record<string, unknown>;
  const values = [payload.overall_score, payload.overallScore, payload.score, payload.final_score];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
  }

  return null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:finalize:${ip}`, 10, 60000)) {
      throw new APIError(429, "Too many finalization requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const body = await parseRequestBody(request);
    const parsed = finalizeSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, "Invalid finalization payload", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const { id: pipelineId } = await context.params;
    const { mode, selected_application_ids: selectedApplicationIds, ai_cutoff_score: aiCutoff, action } = parsed.data;

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, hr_id, title")
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .maybeSingle();

    if (pipelineErr) {
      throw new APIError(500, "Failed to load pipeline", { details: pipelineErr.message });
    }

    if (!pipeline) {
      throw new APIError(404, "Pipeline not found");
    }

    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, candidate_id, resume_id, status")
      .eq("pipeline_id", pipelineId);

    if (appErr) {
      throw new APIError(500, "Failed to load applications", { details: appErr.message });
    }

    const appRows = (applications || []) as ApplicationRow[];
    if (appRows.length === 0) {
      return apiResponse(true, { selected_count: 0, emails_sent: 0, skipped: 0, selected_ids: [] }, "No applications available", 200);
    }

    const applicationIds = appRows.map((row) => row.id);
    const { data: interviews } = await supabaseAdmin
      .from("interviews")
      .select("id, application_id, result_json, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false });

    const latestInterviewByApplication = new Map<string, { score: number | null }>();
    for (const interview of interviews || []) {
      if (!interview?.application_id || latestInterviewByApplication.has(interview.application_id)) {
        continue;
      }

      latestInterviewByApplication.set(interview.application_id, {
        score: parseScore(interview.result_json)
      });
    }

    const resumeIds = Array.from(new Set(appRows.map((row) => row.resume_id).filter(Boolean)));
    const candidateIds = Array.from(new Set(appRows.map((row) => row.candidate_id).filter(Boolean)));

    const { data: resumes } = await supabaseAdmin
      .from("resumes")
      .select("id, metadata")
      .in("id", resumeIds);

    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .in("id", candidateIds as string[]);

    const resumeEmailMap = new Map(
      (resumes || []).map((row) => {
        const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null;
        const email = typeof metadata?.email === "string" ? metadata.email : null;
        return [row.id, email] as const;
      })
    );

    const userEmailMap = new Map((users || []).map((user) => [user.id, user.email] as const));

    let selectedIds: string[] = [];

    if (mode === "manual") {
      const allowedSet = new Set(applicationIds);
      selectedIds = selectedApplicationIds.filter((id) => allowedSet.has(id));
    } else {
      selectedIds = appRows
        .filter((app) => {
          const score = latestInterviewByApplication.get(app.id)?.score;
          return score !== null && score >= aiCutoff;
        })
        .map((app) => app.id);
    }

    const selectedSet = new Set(selectedIds);
    const selectedApps = appRows.filter((app) => selectedSet.has(app.id));

    if (selectedIds.length > 0) {
      const { error: statusErr } = await supabaseAdmin
        .from("applications")
        .update({ status: action === "pass" ? "selected" : "rejected" })
        .in("id", selectedIds);

      if (statusErr) {
        throw new APIError(500, "Failed to update selected candidates", { details: statusErr.message });
      }
    }

    let emailSent = 0;
    let skipped = 0;
    const failures: Array<{ application_id: string; reason: string }> = [];

    for (const app of selectedApps) {
      try {
        const email = (app.candidate_id ? userEmailMap.get(app.candidate_id) : null) || resumeEmailMap.get(app.resume_id) || null;
        if (!email) {
          skipped += 1;
          continue;
        }

        const subject = action === "pass" 
          ? `Congratulations! You have passed all rounds for ${pipeline.title}` 
          : `Update regarding your application for ${pipeline.title}`;
          
        const html = action === "pass"
          ? `
            <h2>Congratulations from ELEVATR!</h2>
            <p>You have passed all rounds for <strong>${pipeline.title}</strong>.</p>
            <p>Please wait for the next email regarding offline rounds.</p>
            <p>Best regards,<br/>ELEVATR HR Team</p>
          `
          : `
            <h2>Update from ELEVATR</h2>
            <p>Thank you for taking the time to interview for <strong>${pipeline.title}</strong>.</p>
            <p>Unfortunately, we will not be moving forward with your application at this time.</p>
            <p>We wish you the best in your job search.</p>
            <p>Best regards,<br/>ELEVATR HR Team</p>
          `;

        const result = await sendEmail({
          to: email,
          subject,
          html
        });

        if (result.skipped) {
          skipped += 1;
          continue;
        }

        emailSent += 1;
      } catch (error) {
        failures.push({
          application_id: app.id,
          reason: error instanceof Error ? error.message : "Email send failed"
        });
      }
    }

    return apiResponse(
      true,
      {
        mode,
        selected_count: selectedIds.length,
        selected_ids: selectedIds,
        emails_sent: emailSent,
        skipped,
        ai_cutoff_score: mode === "ai" ? aiCutoff : undefined,
        failures
      },
      "Candidate finalization completed",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
