import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { createInterviewReportPdf } from "@/ai/report/pdf";
import { evaluateInterview } from "@/ai/interviewer/evaluator";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const resultSchema = z.object({
  result_json: z.record(z.any()),
  candidate_email: z.string().optional(),
  callback_token: z.string().optional(),
  decision: z.enum(["selected", "rejected", "pending"]).default("pending")
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const parsed = resultSchema.safeParse(await request.json());
    if (!parsed.success) {
      console.error("[Result] Validation error:", parsed.error.flatten());
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
    }

    console.log(`[Result] Processing interview result for interview ID: ${params.id}`);

    // Fetch interview with all necessary context (JD and Resume)
    const { data: interview, error: interviewErr } = await supabaseAdmin
      .from("interviews")
      .select(`
        id, 
        application_id, 
        interview_token, 
        applications!inner (
          id,
          email,
          pipeline_id,
          pipelines!inner (
            id,
            title,
            jd_text
          ),
          resumes (
            id,
            content,
            metadata
          )
        )
      `)
      .eq("id", params.id)
      .single();

    if (interviewErr || !interview) {
      console.error("[Result] Interview query failed:", interviewErr?.message);
      return NextResponse.json({ error: interviewErr?.message || "Interview not found" }, { status: 404, headers: corsHeaders });
    }

    console.log(`[Result] Interview found. Application ID: ${interview.application_id}`);

    // Handle Supabase's potentially inconsistent join mapping (Object vs Array)
    const application = Array.isArray(interview.applications) ? interview.applications[0] : (interview.applications as Record<string, unknown>);
    if (!application) {
      console.error("[Result] No linked application found");
      return NextResponse.json({ error: "Linked application not found" }, { status: 404, headers: corsHeaders });
    }

    const pipeline = application.pipelines || {};
    const resumes = Array.isArray(application.resumes) ? application.resumes : [application.resumes];
    const resume = resumes?.[0] || {};
    const jdText = pipeline.jd_text || "";
  const resumeText = resume?.content || (resume?.metadata as Record<string, unknown>)?.content || "";
    const pipelineTitle = pipeline.title || "Standard Pipeline";

    console.log(`[Result] Candidate email: ${application.email || "N/A"}, Pipeline: ${pipelineTitle}`);

    const expectedToken = typeof (interview as { interview_token?: unknown }).interview_token === "string"
      ? ((interview as { interview_token: string }).interview_token || "")
      : "";
    const providedToken = parsed.data.callback_token || "";
    if (providedToken && expectedToken !== providedToken) {
      console.error("[Result] Token mismatch");
      return NextResponse.json({ error: "Unauthorized callback token" }, { status: 401, headers: corsHeaders });
    }

    // 1. AI Evaluation
    const transcript = parsed.data.result_json?.transcript || parsed.data.result_json?.conversation || "";
    console.log(`[Result] Transcript length: ${transcript?.length || 0} chars`);
    
    let evaluation = null;
    if (transcript && transcript.trim().length > 10) {
      console.log("[Result] Starting AI evaluation...");
      evaluation = await evaluateInterview(transcript, jdText, resumeText);
      if (evaluation) {
        console.log(`[Result] AI evaluation completed. Score: ${evaluation.overallScore}`);
      } else {
        console.warn("[Result] AI evaluation returned null");
      }
    } else {
      console.warn("[Result] No valid transcript for AI evaluation");
    }

    // Merge evaluation with the received result
    const enrichedResultJson = evaluation 
      ? { ...parsed.data.result_json, ...evaluation }
      : { ...parsed.data.result_json, summary: "Interview completed without AI evaluation" };

    console.log(`[Result] Enriched result score: ${enrichedResultJson.overallScore || enrichedResultJson.overall_score}`);

    // 2. Generate PDF with enriched data
    console.log("[Result] Generating HR report PDF...");
    const hrPdfBuffer = await createInterviewReportPdf({
      applicationId: interview.application_id,
      pipelineTitle: pipelineTitle,
      candidateEmail: parsed.data.candidate_email || application.email,
      resultJson: enrichedResultJson,
      audience: "hr"
    });

    console.log("[Result] Generating candidate report PDF...");
    const candidatePdfBuffer = await createInterviewReportPdf({
      applicationId: interview.application_id,
      pipelineTitle: pipelineTitle,
      candidateEmail: parsed.data.candidate_email || application.email,
      resultJson: enrichedResultJson,
      audience: "candidate"
    });

    const hrPath = `interview-reports/${interview.id}.pdf`;
    const candidatePath = `interview-reports/${interview.id}-candidate.pdf`;

    console.log(`[Result] Uploading HR report to ${hrPath}...`);
    const { error: hrUploadErr } = await supabaseAdmin.storage.from("reports").upload(hrPath, hrPdfBuffer, {
      contentType: "application/pdf",
      upsert: true
    });

    if (hrUploadErr) {
      console.error("[Result] HR upload error:", hrUploadErr.message);
      return NextResponse.json({ error: hrUploadErr.message }, { status: 500, headers: corsHeaders });
    }

    console.log(`[Result] Uploading candidate report to ${candidatePath}...`);
    const { error: candidateUploadErr } = await supabaseAdmin.storage.from("reports").upload(candidatePath, candidatePdfBuffer, {
      contentType: "application/pdf",
      upsert: true
    });

    if (candidateUploadErr) {
      console.error("[Result] Candidate upload error:", candidateUploadErr.message);
      return NextResponse.json({ error: candidateUploadErr.message }, { status: 500, headers: corsHeaders });
    }

    console.log("[Result] PDFs uploaded successfully");

    const { data: publicData } = supabaseAdmin.storage.from("reports").getPublicUrl(hrPath);
    const { data: candidatePublicData } = supabaseAdmin.storage.from("reports").getPublicUrl(candidatePath);

    const reportUrls = {
      hr: publicData.publicUrl,
      candidate: candidatePublicData.publicUrl
    };

    const enrichedResultWithUrls = {
      ...enrichedResultJson,
      report_urls: reportUrls,
      candidate_report_pdf_url: candidatePublicData.publicUrl
    };

    // 3. Update Interview and Application
    const finalDecision = parsed.data.decision === "pending" ? "interviewed" : parsed.data.decision;
    
    console.log(`[Result] Updating interview status to completed...`);
    const { error: updateErr } = await supabaseAdmin
      .from("interviews")
      .update({ 
        result_json: enrichedResultWithUrls, 
        report_pdf_url: publicData.publicUrl,
        is_used: true,
        interview_status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", params.id);

    if (updateErr) {
      console.error("[Result] Update interview error:", updateErr);
    } else {
      console.log("[Result] Interview updated successfully");
    }

    console.log(`[Result] Updating application status to ${finalDecision}...`);
    const { error: appUpdateErr } = await supabaseAdmin
      .from("applications")
      .update({ 
        status: finalDecision,
        latest_interview_score: evaluation?.overallScore || enrichedResultJson.overall_score || 0,
        latest_report_pdf_url: publicData.publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", interview.application_id);

    if (appUpdateErr) {
      console.error("[Result] Update application error:", appUpdateErr);
    } else {
      console.log("[Result] Application updated successfully");
    }

    // NOTE: Emails are NOT sent here. They are sent during finalization:
    // - Manual selection by HR: Wait for HR to click "Finalize & Send Pass Emails"
    // - AI selection by interview score: HR can automate with cutoff score
    // This keeps the result endpoint focused on data processing, not notifications
    console.log("[Result] Interview processing completed. Candidate will be notified during finalization by HR.");
    console.log(`[Result] Score: ${evaluation?.overallScore || enrichedResultJson.overall_score || 0}`);

    console.log("[Result] Interview processing completed successfully");
    return NextResponse.json(
      { 
        ok: true, 
        report_pdf_url: publicData.publicUrl, 
        candidate_report_pdf_url: candidatePublicData.publicUrl,
        score: evaluation?.overallScore || enrichedResultJson.overall_score
      }, 
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[Result] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" }, 
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  });
}