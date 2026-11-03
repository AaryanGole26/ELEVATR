import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { analyzeResumeAgainstJd } from "@/ai/screening/resumeAnalyzer";
import { extractPdfText, looksLikePdf, MAX_RESUME_BYTES } from "@/shared/pdf";
import { APIError, apiResponse, apiError, assertUuid, rateLimit, getClientIp } from "@/shared/api-utils";

export const runtime = "nodejs";

const MAX_FILES = 100;
const PDF_MIME = "application/pdf";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(`pipeline:batch:${ip}`, 4, 60000)) {
      throw new APIError(429, "Too many batch requests. Please try again in a minute.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: pipelineId } = await context.params;
    assertUuid(pipelineId, "Pipeline");

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

        if (file.size > MAX_RESUME_BYTES) {
          throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max is 5MB.`);
        }

        const pdfBuffer = Buffer.from(await file.arrayBuffer());
        if (!looksLikePdf(pdfBuffer)) {
          throw new Error("This file is not a valid PDF.");
        }
        const resumeText = await extractPdfText(pdfBuffer);

        // Simple email extraction
        const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const extractedEmail = emailMatch ? emailMatch[0].toLowerCase() : null;

        if (resumeText.length < 20) {
          throw new Error("Could not extract enough text from PDF.");
        }

        const result = analyzeResumeAgainstJd(resumeText, pipeline.jd_text);
        const status = (result.score || 0) >= pipeline.threshold ? "shortlisted" : "screened";

        // Upload to Storage
        const storagePath = `batch/${pipelineId}/${crypto.randomUUID()}.pdf`;
        
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("resumes")
          .upload(storagePath, pdfBuffer, {
            contentType: PDF_MIME,
            upsert: false
          });

        if (uploadErr) {
          console.error("Storage upload error:", uploadErr);
          throw new Error("Could not store this file.");
        }

        const { data: resumeRow, error: resumeErr } = await supabaseAdmin
          .from("resumes")
          .insert({
            content: resumeText,
            storage_path: storagePath,
            file_name: file.name,
            file_type: PDF_MIME,
            file_size: file.size,
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
          await supabaseAdmin.storage.from("resumes").remove([storagePath]).catch(() => undefined);
          console.error("Resume insert failed:", resumeErr);
          throw new Error("Could not save this resume.");
        }

        const { error: appErr } = await supabaseAdmin
          .from("applications")
          .insert({
            pipeline_id: pipeline.id,
            candidate_id: null,
            resume_id: resumeRow.id,
            email: extractedEmail,
            score: result.score || 0,
            status
          });

        if (appErr) {
          console.error("Application insert failed:", appErr);
          throw new Error("Could not create the application.");
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
