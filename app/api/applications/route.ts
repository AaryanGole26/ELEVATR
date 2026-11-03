import { z } from "zod";
import { getCurrentRole, getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { apiResponse, apiError, rateLimit, parseRequestBody, APIError, getClientIp } from "@/shared/api-utils";
import { analyzeResumeAgainstJd } from "@/ai/screening/resumeAnalyzer";
import { extractPdfText, looksLikePdf, MAX_RESUME_BYTES } from "@/shared/pdf";
import { readInterviewScore, reportRoute } from "@/shared/interviews";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

const textApplicationSchema = z.object({
  pipeline_id: z.string().uuid("Invalid pipeline ID"),
  resume_text: z.string().min(20, "Resume must be at least 20 characters").max(50_000, "Resume is too large")
});

const ACTIVE_STAGES_FOR_INTERVIEW = new Set(["shortlisted", "interview"]);

export async function GET(request: Request) {
  try {
    if (!rateLimit(`application:list:${getClientIp(request)}`, 30, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) throw new APIError(401, "Authentication required.");

    const { data: applications, error } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, status, score, created_at, updated_at, pipeline:pipelines(title), interviews(id, interview_link, is_used, interview_status, expires_at, result_json, report_pdf_url, completed_at, created_at)")
      .eq("candidate_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw new APIError(500, "Failed to load applications", { details: error.message });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = (applications || []).map((app: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest = [...(app.interviews || [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
      const completed = !!latest?.is_used;
      const linkOpen =
        !!latest && !completed && ACTIVE_STAGES_FOR_INTERVIEW.has(app.status) &&
        (!latest.expires_at || new Date(latest.expires_at).getTime() > Date.now());

      const timeline = [
        { round: "applied", stage_order: 1, label: "Application submitted", at: app.created_at },
        ...(latest
          ? [{ round: "interview-invite", stage_order: 2, label: "Interview invited", at: latest.created_at }]
          : []),
        ...(completed
          ? [{ round: "interview-complete", stage_order: 3, label: "Interview completed", at: latest.completed_at || latest.created_at }]
          : []),
        ...(app.status === "selected" || app.status === "rejected"
          ? [{ round: "decision", stage_order: 4, label: app.status === "selected" ? "Selected" : "Not selected", at: app.updated_at || app.created_at }]
          : [])
      ];

      return {
        id: app.id,
        pipeline_id: app.pipeline_id,
        status: app.status,
        score: app.score,
        created_at: app.created_at,
        interview_link: linkOpen ? latest.interview_link : null,
        interview_report_url: completed && latest.report_pdf_url ? reportRoute(latest.id, "candidate") : null,
        interview_score: readInterviewScore(latest?.result_json),
        interview_completed: completed,
        round_records: timeline,
        pipeline: { title: app.pipeline?.title || "Position" }
      };
    });

    return apiResponse(true, { applications: normalized }, "Applications retrieved successfully");
  } catch (error) {
    return apiError(error);
  }
}

/**
 * POST /api/applications
 * Accepts a PDF upload (multipart: pipeline_id, resume) or pasted text (JSON: pipeline_id,
 * resume_text). The file comes through the server so it can be validated before storage, and the
 * identity, score and status are always determined here, never by the caller.
 */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`application:${getClientIp(request)}`, 20, 60_000)) {
      throw new APIError(429, "Too many applications submitted. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) throw new APIError(401, "Authentication required. Please log in to apply.");
    if ((await getCurrentRole(user)) !== "candidate") {
      throw new APIError(403, "Only candidate accounts can apply to positions.");
    }

    let pipelineId: string;
    let resumeText = "";
    let file: { buffer: Buffer; name: string; type: string; size: number } | null = null;

    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await request.formData();
      const upload = form.get("resume");
      const parsedId = z.string().uuid().safeParse(form.get("pipeline_id"));
      if (!parsedId.success) throw new APIError(400, "Invalid pipeline ID.");
      pipelineId = parsedId.data;

      if (!(upload instanceof File) || upload.size === 0) throw new APIError(400, "Please attach your resume as a PDF.");
      if (upload.size > MAX_RESUME_BYTES) throw new APIError(413, "Resume file is too large (max 5MB).");

      const buffer = Buffer.from(await upload.arrayBuffer());
      if (!looksLikePdf(buffer)) throw new APIError(400, "Please upload a valid PDF file.");

      try {
        resumeText = await extractPdfText(buffer);
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        throw new APIError(400, "We couldn't read that PDF. Please try a different file.");
      }
      file = { buffer, name: upload.name, type: "application/pdf", size: upload.size };
    } else {
      const parsed = textApplicationSchema.safeParse(await parseRequestBody(request));
      if (!parsed.success) {
        throw new APIError(400, parsed.error.issues[0]?.message || "Invalid application data");
      }
      pipelineId = parsed.data.pipeline_id;
      resumeText = parsed.data.resume_text;
    }

    if (resumeText.length < 20) {
      throw new APIError(400, "We couldn't find enough text in that resume. Scanned PDFs aren't supported, so please try a text-based PDF.");
    }

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, is_active, jd_text, threshold")
      .eq("id", pipelineId)
      .maybeSingle();

    if (pipelineErr) throw new APIError(500, "Failed to load pipeline", { details: pipelineErr.message });
    if (!pipeline) throw new APIError(404, "This position no longer exists.");
    if (!pipeline.is_active) throw new APIError(403, "This position is no longer accepting applications.");

    const { data: existing } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .eq("candidate_id", user.id)
      .maybeSingle();
    if (existing) throw new APIError(409, "You have already applied to this position.");

    const screening = analyzeResumeAgainstJd(resumeText, pipeline.jd_text);
    const email = (user.email || "").toLowerCase();

    let storagePath: string | null = null;
    if (file) {
      storagePath = `${user.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("resumes")
        .upload(storagePath, file.buffer, { contentType: file.type, upsert: false });
      if (uploadErr) throw new APIError(500, "Failed to store resume", { details: uploadErr.message });
    }

    const { data: resume, error: resumeErr } = await supabaseAdmin
      .from("resumes")
      .insert({
        user_id: user.id,
        content: resumeText,
        storage_path: storagePath,
        file_name: file?.name ?? null,
        file_type: file?.type ?? null,
        file_size: file?.size ?? null,
        metadata: { email, pipeline_id: pipelineId, source: file ? "upload" : "text" }
      })
      .select("id")
      .single();

    if (resumeErr || !resume) {
      if (storagePath) await supabaseAdmin.storage.from("resumes").remove([storagePath]).catch(() => undefined);
      throw new APIError(500, "Failed to store resume record", { details: resumeErr?.message });
    }

    const { data: application, error: appErr } = await supabaseAdmin
      .from("applications")
      .insert({
        pipeline_id: pipelineId,
        candidate_id: user.id,
        resume_id: resume.id,
        email,
        score: screening.score,
        status: screening.score >= pipeline.threshold ? "shortlisted" : "screened",
        metadata: { feedback: screening.feedback, applied_at: new Date().toISOString() }
      })
      .select("id, status, created_at")
      .single();

    if (appErr || !application) {
      // Removes the orphaned resume so that a failed or duplicate submission leaves nothing behind.
      await supabaseAdmin.from("resumes").delete().eq("id", resume.id);
      if (storagePath) await supabaseAdmin.storage.from("resumes").remove([storagePath]).catch(() => undefined);
      if (appErr?.code === "23505") throw new APIError(409, "You have already applied to this position.");
      throw new APIError(500, "Failed to create application", { details: appErr?.message });
    }

    return apiResponse(
      true,
      { application_id: application.id, status: application.status, created_at: application.created_at },
      "Application submitted successfully",
      201
    );
  } catch (error) {
    return apiError(error);
  }
}
