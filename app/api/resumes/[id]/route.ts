import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit } from "@/shared/api-utils";

type ResumeRow = {
  id: string;
  user_id: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  content: string | null;
  parsed_content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function normalizeResumeRow(raw: Record<string, unknown>): ResumeRow {
  const metadata = (raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : {}) as Record<string, unknown>;
  
  return {
    id: String(raw.id || ""),
    user_id: typeof raw.user_id === "string" ? raw.user_id : null,
    storage_path: typeof raw.storage_path === "string" ? raw.storage_path : (metadata.storagePath as string | null) || null,
    file_name: typeof raw.file_name === "string" ? raw.file_name : (metadata.file_name as string | null) || null,
    file_type: typeof raw.file_type === "string" ? raw.file_type : (metadata.file_type as string | null) || null,
    file_size: typeof raw.file_size === "number" ? raw.file_size : (metadata.file_size as number | null) || null,
    content: typeof raw.content === "string" ? raw.content : null,
    parsed_content: typeof raw.parsed_content === "string" ? raw.parsed_content : null,
    metadata: raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString()
  };
}

async function loadAuthorizedResume(resumeId: string, hrId: string) {
  const { data: rawResume, error: resumeErr } = await supabaseAdmin
    .from("resumes")
    .select("*")
    .eq("id", resumeId)
    .maybeSingle<Record<string, unknown>>();

  if (resumeErr) {
    throw new APIError(500, "Failed to load resume", { details: resumeErr.message });
  }

  if (!rawResume) {
    throw new APIError(404, "Resume not found.");
  }

  const resume = normalizeResumeRow(rawResume);

  const { data: applications, error: appErr } = await supabaseAdmin
    .from("applications")
    .select("id, pipeline_id, status, score, created_at")
    .eq("resume_id", resumeId);

  if (appErr) {
    throw new APIError(500, "Failed to verify resume ownership", { details: appErr.message });
  }

  const pipelineIds = Array.from(new Set((applications || []).map((application) => application.pipeline_id).filter(Boolean)));

  let pipelines: Array<{ id: string; title: string; hr_id: string }> = [];
  if (pipelineIds.length > 0) {
    const { data: pipelineRows, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, hr_id")
      .in("id", pipelineIds);

    if (pipelineErr) {
      throw new APIError(500, "Failed to verify pipeline ownership", { details: pipelineErr.message });
    }

    pipelines = pipelineRows || [];
  }

  const authorizedPipelineIds = new Set((pipelines || []).filter((pipeline) => pipeline.hr_id === hrId).map((pipeline) => pipeline.id));

  if (authorizedPipelineIds.size === 0) {
    throw new APIError(403, "You do not have permission to access this resume.");
  }

  const linkedApplications = (applications || [])
    .filter((application) => authorizedPipelineIds.has(application.pipeline_id))
    .map((application) => ({
      id: application.id,
      pipeline_id: application.pipeline_id,
      pipeline_title: pipelines?.find((pipeline) => pipeline.id === application.pipeline_id)?.title || "Pipeline",
      status: application.status,
      score: application.score,
      created_at: application.created_at
    }));

  if ((applications || []).length > 0 && linkedApplications.length !== (applications || []).length) {
    throw new APIError(403, "You do not have permission to access this resume.");
  }

  let viewUrl: string | null = null;
  if (resume.storage_path) {
    const { data: signedUrl } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(resume.storage_path, 60 * 30);

    viewUrl = signedUrl?.signedUrl || null;
  }

  return {
    resume,
    applications: applications || [],
    linkedApplications,
    viewUrl
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`resume:view:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: resumeId } = await context.params;
    const { resume, linkedApplications, viewUrl } = await loadAuthorizedResume(resumeId, guard.user.id);

    return apiResponse(
      true,
      {
        resume: {
          id: resume.id,
          user_id: resume.user_id,
          file_name: resume.file_name,
          file_type: resume.file_type,
          file_size: resume.file_size,
          created_at: resume.created_at,
          content: resume.content,
          parsed_content: resume.parsed_content,
          metadata: resume.metadata,
          storage_path: resume.storage_path,
          view_url: viewUrl
        },
        applications: linkedApplications
      },
      "Resume retrieved successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`resume:delete:${ip}`, 10, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: resumeId } = await context.params;
    const { resume, applications, linkedApplications } = await loadAuthorizedResume(resumeId, guard.user.id);

    const cleanupWarnings: string[] = [];

    if (applications.length > 0) {
      const applicationIds = applications.map((application) => application.id).filter(Boolean);

      if (applicationIds.length > 0) {
        const { error: interviewDeleteErr } = await supabaseAdmin
          .from("interviews")
          .delete()
          .in("application_id", applicationIds);

        if (interviewDeleteErr) {
          cleanupWarnings.push(`interviews: ${interviewDeleteErr.message}`);
        }
      }

      const { error: analysesDeleteErr } = await supabaseAdmin
        .from("analyses")
        .delete()
        .eq("resume_id", resumeId);

      if (analysesDeleteErr) {
        cleanupWarnings.push(`analyses: ${analysesDeleteErr.message}`);
      }

      const { error: applicationsDeleteErr } = await supabaseAdmin
        .from("applications")
        .delete()
        .eq("resume_id", resumeId);

      if (applicationsDeleteErr) {
        throw new APIError(500, "Failed to delete linked applications", { details: applicationsDeleteErr.message });
      }
    }

    if (resume.storage_path) {
      const { error: storageErr } = await supabaseAdmin.storage.from("resumes").remove([resume.storage_path]);
      if (storageErr) {
        cleanupWarnings.push(storageErr.message);
      }
    }

    const { error: deleteErr } = await supabaseAdmin.from("resumes").delete().eq("id", resumeId);

    if (deleteErr) {
      throw new APIError(500, "Failed to delete resume", { details: deleteErr.message });
    }

    return apiResponse(
      true,
      {
        resume_id: resumeId,
        removed_applications: linkedApplications.length,
        cleanup_warnings: cleanupWarnings
      },
      cleanupWarnings.length > 0 ? "Resume deleted, but storage cleanup reported warnings" : "Resume deleted successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}