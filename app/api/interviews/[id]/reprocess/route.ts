import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { createInterviewReportPdf } from "@/ai/report/pdf";
import { evaluateInterview } from "@/ai/interviewer/evaluator";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";
import type { InterviewEvaluation } from "@/shared/types";

/**
 * POST /api/interviews/[id]/reprocess
 * 
 * DEV ENDPOINT: Manually reprocess an interview result
 * Useful for debugging when initial processing failed
 * HR only - can retry evaluation, PDF generation, DB updates
 */

const reprocessSchema = z.object({
  transcript: z.string().optional(),
  force_reevaluate: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`interview:reprocess:${ip}`, 5, 60000)) {
      throw new APIError(429, "Too many requests");
    }

    // Auth check - HR only
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: interviewId } = await context.params;

    // Fetch interview with context
    const { data: interview, error: interviewErr } = await supabaseAdmin
      .from("interviews")
      .select(`
        id,
        application_id,
        result_json,
        applications!inner (
          id,
          email,
          pipeline_id,
          pipelines!inner (
            id,
            title,
            jd_text,
            hr_id
          ),
          resumes (
            id,
            content,
            metadata
          )
        )
      `)
      .eq("id", interviewId)
      .single();

    if (interviewErr || !interview) {
      throw new APIError(404, "Interview not found");
    }

    // Verify HR ownership
    const application = Array.isArray(interview.applications)
      ? interview.applications[0]
      : (interview.applications as Record<string, unknown>);

    const pipeline = application.pipelines || {};
    if ((pipeline.hr_id as string) !== guard.user.id) {
      throw new APIError(403, "Not authorized to reprocess this interview");
    }

    const body = await parseRequestBody(request);
    const parsed = reprocessSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid request", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { transcript: overrideTranscript, force_reevaluate } = parsed.data;

    // Get transcript from result_json or override
    const transcript =
      overrideTranscript ||
      interview.result_json?.transcript ||
      interview.result_json?.conversation ||
      "";

    console.log(`[Reprocess] Processing interview ${interviewId}`);
    console.log(`[Reprocess] Transcript length: ${transcript.length}`);
    console.log(`[Reprocess] Force reevaluate: ${force_reevaluate}`);

    // Get pipeline/resume context
    const resumes = Array.isArray(application.resumes)
      ? application.resumes
      : [application.resumes];
    const resume = resumes?.[0] || {};
    const jdText = pipeline.jd_text || "";
    const resumeText =
      resume?.content || (resume?.metadata as Record<string, unknown>)?.content || "";

    // Re-evaluate if needed
    let evaluationResult: InterviewEvaluation | null = null;
    if (force_reevaluate || !interview.result_json?.overallScore) {
      if (transcript && transcript.trim().length > 10) {
        console.log("[Reprocess] Running AI evaluation...");
        const evalResult = await evaluateInterview(transcript, jdText, resumeText);
        if (evalResult) {
          console.log(
            `[Reprocess] Evaluation complete. Score: ${evalResult.overallScore}`
          );
          evaluationResult = evalResult;
        } else {
          console.warn("[Reprocess] AI evaluation returned null");
        }
      } else {
        console.warn("[Reprocess] No valid transcript for AI evaluation");
      }
    }

    // Build enriched result
    const enrichedResultJson = evaluationResult
      ? { ...interview.result_json, ...evaluationResult }
      : { ...interview.result_json, summary: interview.result_json?.summary || "Interview completed without AI evaluation" };

    console.log(`[Reprocess] Generating PDFs...`);

    // Generate PDFs
    const hrPdfBuffer = await createInterviewReportPdf({
      applicationId: interview.application_id,
      pipelineTitle: pipeline.title || "Standard Pipeline",
      candidateEmail: application.email,
      resultJson: enrichedResultJson,
      audience: "hr",
    });

    const candidatePdfBuffer = await createInterviewReportPdf({
      applicationId: interview.application_id,
      pipelineTitle: pipeline.title || "Standard Pipeline",
      candidateEmail: application.email,
      resultJson: enrichedResultJson,
      audience: "candidate",
    });

    const hrPath = `interview-reports/${interview.id}.pdf`;
    const candidatePath = `interview-reports/${interview.id}-candidate.pdf`;

    // Upload PDFs
    const { error: hrUploadErr } = await supabaseAdmin.storage
      .from("reports")
      .upload(hrPath, hrPdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (hrUploadErr) {
      throw new APIError(500, `HR PDF upload failed: ${hrUploadErr.message}`);
    }

    const { error: candidateUploadErr } = await supabaseAdmin.storage
      .from("reports")
      .upload(candidatePath, candidatePdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (candidateUploadErr) {
      throw new APIError(
        500,
        `Candidate PDF upload failed: ${candidateUploadErr.message}`
      );
    }

    const { data: publicData } = supabaseAdmin.storage
      .from("reports")
      .getPublicUrl(hrPath);
    const { data: candidatePublicData } = supabaseAdmin.storage
      .from("reports")
      .getPublicUrl(candidatePath);

    console.log("[Reprocess] PDFs uploaded successfully");

    // Update interview and application
    const enrichedResultWithUrls = {
      ...enrichedResultJson,
      report_urls: {
        hr: publicData.publicUrl,
        candidate: candidatePublicData.publicUrl,
      },
      candidate_report_pdf_url: candidatePublicData.publicUrl,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("interviews")
      .update({
        result_json: enrichedResultWithUrls,
        report_pdf_url: publicData.publicUrl,
      })
      .eq("id", interviewId);

    if (updateErr) {
      throw new APIError(500, `Interview update failed: ${updateErr.message}`);
    }

    const { error: appUpdateErr } = await supabaseAdmin
      .from("applications")
      .update({
        status: "interviewed",
        latest_interview_score:
          evaluationResult?.overallScore ||
          enrichedResultJson?.overallScore ||
          enrichedResultJson?.overall_score ||
          0,
        latest_report_pdf_url: publicData.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interview.application_id);

    if (appUpdateErr) {
      throw new APIError(
        500,
        `Application update failed: ${appUpdateErr.message}`
      );
    }

    console.log("[Reprocess] Database updates complete");

    return apiResponse(
      true,
      {
        interview_id: interviewId,
        score: evaluation?.overallScore || 0,
        report_url: publicData.publicUrl,
        ai_generated: !!evaluation,
        transcript_processed: !!transcript,
      },
      "Interview reprocessed successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
