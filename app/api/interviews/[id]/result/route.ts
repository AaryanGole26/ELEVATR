import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { createInterviewReportPdf } from "@/ai/report/pdf";
import { sendEmail } from "@/shared/email";
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
  const parsed = resultSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: corsHeaders });
  }

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
    console.error("Interview query failed:", interviewErr?.message);
    return NextResponse.json({ error: interviewErr?.message || "Interview not found" }, { status: 404, headers: corsHeaders });
  }

  // Handle Supabase's potentially inconsistent join mapping (Object vs Array)
  const application = Array.isArray(interview.applications) ? interview.applications[0] : (interview.applications as any);
  if (!application) {
    return NextResponse.json({ error: "Linked application not found" }, { status: 404, headers: corsHeaders });
  }

  const pipeline = application.pipelines || {};
  const resume = application.resumes || {};
  const jdText = pipeline.jd_text || "";
  const resumeText = resume.content || (resume.metadata as any)?.content || "";
  const pipelineTitle = pipeline.title || "Standard Pipeline";

  const expectedToken = typeof (interview as { interview_token?: unknown }).interview_token === "string"
    ? ((interview as { interview_token: string }).interview_token || "")
    : "";
  const providedToken = parsed.data.callback_token || "";
  if (providedToken && expectedToken !== providedToken) {
    return NextResponse.json({ error: "Unauthorized callback token" }, { status: 401, headers: corsHeaders });
  }

  // 1. AI Evaluation
  const transcript = parsed.data.result_json?.transcript || parsed.data.result_json?.conversation || "";
  let evaluation = null;
  if (transcript) {
    evaluation = await evaluateInterview(transcript, jdText, resumeText);
  }

  const enrichedResultJson = evaluation 
    ? { ...parsed.data.result_json, ...evaluation }
    : parsed.data.result_json;

  // 2. Generate PDF with enriched data
  const hrPdfBuffer = await createInterviewReportPdf({
    applicationId: interview.application_id,
    pipelineTitle: pipelineTitle,
    candidateEmail: parsed.data.candidate_email || application.email,
    resultJson: enrichedResultJson,
    audience: "hr"
  });

  const candidatePdfBuffer = await createInterviewReportPdf({
    applicationId: interview.application_id,
    pipelineTitle: pipelineTitle,
    candidateEmail: parsed.data.candidate_email || application.email,
    resultJson: enrichedResultJson,
    audience: "candidate"
  });

  const hrPath = `interview-reports/${interview.id}.pdf`;
  const candidatePath = `interview-reports/${interview.id}-candidate.pdf`;

  const { error: hrUploadErr } = await supabaseAdmin.storage.from("reports").upload(hrPath, hrPdfBuffer, {
    contentType: "application/pdf",
    upsert: true
  });

  if (hrUploadErr) {
    return NextResponse.json({ error: hrUploadErr.message }, { status: 500, headers: corsHeaders });
  }

  const { error: candidateUploadErr } = await supabaseAdmin.storage.from("reports").upload(candidatePath, candidatePdfBuffer, {
    contentType: "application/pdf",
    upsert: true
  });

  if (candidateUploadErr) {
    return NextResponse.json({ error: candidateUploadErr.message }, { status: 500, headers: corsHeaders });
  }

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
  const { error: updateErr } = await supabaseAdmin
    .from("interviews")
    .update({ 
      result_json: enrichedResultWithUrls, 
      report_pdf_url: publicData.publicUrl,
      is_used: true 
    })
    .eq("id", params.id);

  if (updateErr) {
    console.error("Update interview error:", updateErr);
  }

  await supabaseAdmin
    .from("applications")
    .update({ 
      status: parsed.data.decision === "pending" ? "interviewed" : parsed.data.decision,
      latest_interview_score: evaluation?.overallScore || 0,
      latest_report_pdf_url: publicData.publicUrl
    })
    .eq("id", interview.application_id);

  if (parsed.data.candidate_email || application.email) {
    await sendEmail({
      to: parsed.data.candidate_email || application.email,
      subject: "ELEVATR Interview Completed",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Interview Completed</h2>
          <p>Your AI video interview has been successfully submitted and analyzed.</p>
          <p>Our HR team will review your report and get back to you soon.</p>
          <hr />
          <p>Thank you for using ELEVATR.</p>
        </div>
      `
    });
  }

  return NextResponse.json({ ok: true, report_pdf_url: publicData.publicUrl, candidate_report_pdf_url: candidatePublicData.publicUrl }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  });
}