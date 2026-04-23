import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { analyzeResumeAgainstJd } from "@/ai/screening/resumeAnalyzer";
import pdfParse from "pdf-parse";
import { APIError, apiResponse, apiError, rateLimit } from "@/shared/api-utils";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 100;
const PDF_MIME = "application/pdf";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:batch:${ip}`, 4, 60000)) {
      throw new APIError(429, "Too many batch requests. Please try again in a minute.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: pipelineId } = await context.params;

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, hr_id, title, jd_text, threshold")
      .eq("id", pipelineId)
      .eq("hr_id", guard.user.id)
      .maybeSingle();

    if (pipelineErr) {
      throw new APIError(500, "Failed to verify pipeline", { details: pipelineErr.message });
    }

    if (!pipeline) {
      throw new APIError(404, "Pipeline not found.");
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      throw new APIError(400, "No PDF files uploaded. Please select at least one PDF resume.");
    }

    if (files.length > MAX_FILES) {
      throw new APIError(400, `Too many files. Maximum allowed is ${MAX_FILES} PDFs per batch.`);
    }

    let created = 0;
    let shortlisted = 0;
    let screened = 0;
    const failed: Array<{ index: number; file_name: string; reason: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        if (file.type !== PDF_MIME) {
          throw new Error(`Unsupported file type: ${file.type || "unknown"}. Only PDF is allowed.`);
        }

        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max is 5MB.`);
        }

        // Timer/Delay to avoid overwhelming the server
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        const fileBuffer = await file.arrayBuffer();
        
        // Ensure resumes bucket exists (robust recovery)
        const { data: bucketCheck } = await supabaseAdmin.storage.getBucket("resumes");
        if (!bucketCheck) {
          console.log("Bucket 'resumes' not detected at runtime, attempting auto-creation...");
          await supabaseAdmin.storage.createBucket("resumes", { public: false });
        }

        const pdfBuffer = Buffer.from(fileBuffer);
        const parsedPdf = await pdfParse(pdfBuffer);
        const resumeText = (parsedPdf.text || "").trim();

        // Simple email extraction
        const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const extractedEmail = emailMatch ? emailMatch[0].toLowerCase() : null;

        if (resumeText.length < 20) {
          throw new Error("Could not extract enough text from PDF.");
        }

        const result = analyzeResumeAgainstJd(resumeText, pipeline.jd_text);
        const status = (result.score || 0) >= pipeline.threshold ? "shortlisted" : "screened";

        // Upload to Storage
        const timestamp = Date.now();
        const storagePath = `batch/${pipelineId}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("resumes")
          .upload(storagePath, fileBuffer, {
            contentType: PDF_MIME,
            upsert: true
          });

        if (uploadErr) {
          console.error("Storage upload error:", uploadErr);
          // We continue but log it; the DB record will lack a storage path if we don't throw here
          // For batch, we probably want to throw and catch to record the failure
          throw new Error(`Failed to upload to storage: ${uploadErr.message}`);
        }

        // Store metadata in DB - using extremely minimal columns for maximum schema compatibility
        const { data: resumeRow, error: resumeErr } = await supabaseAdmin
          .from("resumes")
          .insert({
            content: resumeText,
            storage_path: storagePath,
            metadata: {
              email: extractedEmail,
              file_name: file.name,
              batch_upload: true,
              pipeline_id: pipelineId
            }
          })
          .select("id")
          .single();

        if (resumeErr || !resumeRow) {
          // Cleanup storage if DB fails
          await supabaseAdmin.storage.from("resumes").remove([storagePath]).catch(() => {});
          throw new Error(resumeErr?.message || "Failed to store resume record");
        }

        const { error: appErr } = await supabaseAdmin
          .from("applications")
          .insert({
            pipeline_id: pipeline.id,
            candidate_id: null,
            resume_id: resumeRow.id,
            score: result.score || 0,
            status
          });

        if (appErr) {
          throw new Error(appErr.message || "Failed to create application");
        }

        created += 1;
        if (status === "shortlisted") {
          shortlisted += 1;
        } else {
          screened += 1;
        }
      } catch (err) {
        failed.push({
          index: i + 1,
          file_name: file.name,
          reason: err instanceof Error ? err.message : "Unknown failure"
        });
      }
    }

    return apiResponse(
      true,
      {
        pipeline_id: pipeline.id,
        pipeline_title: pipeline.title,
        threshold: pipeline.threshold,
        total_received: files.length,
        created,
        shortlisted,
        screened,
        failed
      },
      `Processed ${created}/${files.length} resumes`,
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
