import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";

const updatePipelineSchema = z.object({
  job_title: z.string().min(3, "Job title must be at least 3 characters").max(100, "Job title must be less than 100 characters"),
  jd_text: z.string().min(20, "Job description must be at least 20 characters"),
  tags: z.array(z.string().min(1)).default([]),
  threshold: z.number().min(0, "Threshold must be >= 0").max(100, "Threshold must be <= 100"),
  is_active: z.boolean().optional()
});

function readInterviewScore(resultJson: unknown): number | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }

  const payload = resultJson as Record<string, unknown>;
  const candidates = [payload.overall_score, payload.overallScore, payload.score, payload.final_score];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
  }

  return null;
}

function readReportUrl(resultJson: unknown, preferredAudience: "hr" | "candidate" = "hr"): string | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }

  const payload = resultJson as Record<string, unknown>;
  const reportUrls = payload.report_urls && typeof payload.report_urls === "object"
    ? (payload.report_urls as Record<string, unknown>)
    : null;

  const primary = preferredAudience === "candidate" ? reportUrls?.candidate : reportUrls?.hr;
  if (typeof primary === "string" && primary.trim()) {
    return primary;
  }

  const legacy = preferredAudience === "candidate" ? payload.candidate_report_pdf_url : payload.report_pdf_url;
  return typeof legacy === "string" && legacy.trim() ? legacy : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:detail:${ip}`, 50, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: pipelineId } = await context.params;

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, hr_id, title, jd_text, tags, threshold, created_at")
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .maybeSingle();

    if (pipelineErr) {
      throw new APIError(500, "Failed to fetch pipeline", { details: pipelineErr.message });
    }

    if (!pipeline) {
      throw new APIError(404, "Pipeline not found.");
    }

    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, candidate_id, resume_id, status, score, created_at")
      .eq("pipeline_id", pipelineId)
      .order("created_at", { ascending: false });

    if (appErr) {
      throw new APIError(500, "Failed to fetch pipeline applications", { details: appErr.message });
    }

    const resumeIds = Array.from(new Set((applications || []).map((app) => app.resume_id).filter(Boolean)));
    const candidateIds = Array.from(new Set((applications || []).map((app) => app.candidate_id).filter(Boolean)));

    const { data: resumes, error: resumesErr } = await supabaseAdmin
      .from("resumes")
      .select("id, content, metadata")
      .in("id", resumeIds);

    if (resumesErr) {
      console.error("Resumes query failed:", resumesErr.message);
    }

    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .in("id", candidateIds as string[]);

    const applicationIds = (applications || []).map((app) => app.id);
    const { data: interviews } = await supabaseAdmin
      .from("interviews")
      .select("id, application_id, result_json, report_pdf_url, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false });

    const resumeMap = new Map((resumes || []).map((resume) => [resume.id, resume]));
    const userEmailMap = new Map((users || []).map((user) => [user.id, user.email]));
    const latestInterviewByApplication = new Map<string, {
      id: string;
      report_pdf_url: string | null;
      candidate_report_pdf_url: string | null;
      score: number | null;
      recommendation: "selected" | "pending";
      created_at: string;
    }>();

    for (const interview of interviews || []) {
      if (!interview?.application_id || latestInterviewByApplication.has(interview.application_id)) {
        continue;
      }

      const score = readInterviewScore(interview.result_json);
      latestInterviewByApplication.set(interview.application_id, {
        id: interview.id,
        report_pdf_url: interview.report_pdf_url || readReportUrl(interview.result_json, "hr"),
        candidate_report_pdf_url: readReportUrl(interview.result_json, "candidate"),
        score,
        recommendation: score !== null && score >= 70 ? "selected" : "pending",
        created_at: interview.created_at
      });
    }

    const rows = (applications || []).map((app) => {
      const resume = resumeMap.get(app.resume_id);
      const resumeMetadata = resume?.metadata && typeof resume.metadata === "object" ? (resume.metadata as Record<string, unknown>) : null;
      const resumeEmail = typeof resumeMetadata?.email === "string" ? resumeMetadata.email : null;
      const resumeText = typeof resume?.content === "string" ? resume.content : "";
      const latestInterview = latestInterviewByApplication.get(app.id);

      return {
        ...app,
        resume_id: app.resume_id,
        email: (app.candidate_id ? userEmailMap.get(app.candidate_id) : null) || resumeEmail || "Guest candidate",
        email_source: app.candidate_id ? "dashboard" : resumeEmail ? "resume" : "manual",
        resume_preview: resumeText.slice(0, 220),
        resume_length: resumeText.length,
        latest_interview_id: latestInterview?.id || null,
        latest_interview_score: latestInterview?.score ?? null,
        latest_interview_recommendation: latestInterview?.recommendation || null,
        latest_report_pdf_url: latestInterview?.candidate_report_pdf_url || latestInterview?.report_pdf_url || null,
        latest_interview_at: latestInterview?.created_at || null
      };
    });
    const scored = rows.filter((app) => app.score !== null && app.score !== undefined);
    const avgScore =
      scored.length > 0
        ? Math.round((scored.reduce((sum, app) => sum + (app.score || 0), 0) / scored.length) * 100) / 100
        : 0;

    const shortlisted = rows.filter((app) => ["shortlisted", "interview", "selected"].includes(app.status || "")).length;

    return apiResponse(
      true,
      {
        pipeline: {
          ...pipeline,
          job_title: pipeline.title,
          is_active: (pipeline as any).is_active ?? true
        },
        applications: rows,
        stats: {
          candidates: rows.length,
          avg_score: avgScore,
          shortlisted
        }
      },
      "Pipeline details retrieved",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:update:${ip}`, 20, 60000)) {
      throw new APIError(429, "Too many update requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: pipelineId } = await context.params;
    const body = await parseRequestBody(request);
    const parsed = updatePipelineSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid pipeline update data", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const payload: any = {
      title: parsed.data.job_title,
      jd_text: parsed.data.jd_text,
      tags: parsed.data.tags,
      threshold: parsed.data.threshold
    };
    /* is_active toggle disabled temporarily to fix 500 */

    const { data: updatedPipeline, error } = await supabaseAdmin
      .from("pipelines")
      .update(payload)
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .select("id, title, jd_text, tags, threshold, created_at")
      .maybeSingle();

    if (error) {
      throw new APIError(500, "Failed to update pipeline", { details: error.message });
    }

    if (!updatedPipeline) {
      throw new APIError(404, "Pipeline not found.");
    }

    return apiResponse(
      true,
      {
        pipeline: {
          ...updatedPipeline,
          job_title: (updatedPipeline as any).title,
          is_active: (updatedPipeline as any).is_active ?? true
        }
      },
      "Pipeline updated successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
