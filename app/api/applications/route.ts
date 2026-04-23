import { z } from "zod";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { apiResponse, apiError, rateLimit, parseRequestBody, APIError } from "@/shared/api-utils";
import { analyzeResumeAgainstJd } from "@/ai/screening/resumeAnalyzer";
import pdf from "pdf-parse";

const createApplicationSchema = z.object({
  pipeline_id: z.string().uuid("Invalid pipeline ID"),
  email: z.string().email("Invalid email"),
  resume_text: z.string().min(20, "Resume must be at least 20 characters").optional(),
  storage_path: z.string().optional(),
  file_name: z.string().optional(),
  file_type: z.string().optional(),
  file_size: z.number().optional(),
});

function readInterviewScore(resultJson: unknown): number | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }

  const payload = resultJson as Record<string, unknown>;
  const candidates = [payload.overall_score, payload.overallScore, payload.score, payload.final_score];
  for (const value of candidates) {
    if (typeof value === "number") return Math.round(value);
    if (typeof value === "string" && !isNaN(parseInt(value))) return parseInt(value);
  }
  return null;
}

function readCandidateReportUrl(resultJson: unknown): string | null {
  if (!resultJson || typeof resultJson !== "object") {
    return null;
  }

  const payload = resultJson as Record<string, unknown>;
  const reportUrls = payload.report_urls;
  if (reportUrls && typeof reportUrls === "object") {
    const candidateUrl = (reportUrls as Record<string, unknown>).candidate;
    if (typeof candidateUrl === "string" && candidateUrl.trim()) {
      return candidateUrl;
    }
  }

  const fallbackUrl = payload.candidate_report_pdf_url;
  return typeof fallbackUrl === "string" && fallbackUrl.trim() ? fallbackUrl : null;
}

function extractNameFromResume(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    let line = lines[i];
    // Remove emails, URLs, and phone-like patterns
    line = line.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ' ');
    line = line.replace(/https?:\/\/[^\s]+/g, ' ');
    line = line.replace(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*/gi, ' ');
    line = line.replace(/[\d+()-]/g, ' ');
    line = line.replace(/email|phone|mobile|linkedin|github|address/gi, ' ');
    line = line.trim();
    
    // Check if what is left looks like a name
    if (line.length >= 3 && /[a-zA-Z]/.test(line)) {
      const parts = line.split(/\s+/).filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));
      if (parts.length >= 1 && parts.length <= 4) {
        return parts.slice(0, 3).join(' ').toUpperCase();
      }
    }
  }
  return "CANDIDATE";
}


export async function GET(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`application:list:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) {
      return apiResponse(true, { applications: [] }, "No applications found", 200);
    }

    const { data: applications, error } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, status, score, created_at, pipeline:pipelines(title)")
      .eq("candidate_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new APIError(500, "Failed to load applications", { details: error.message });
    }

    const applicationIds = (applications || []).map((app: any) => app.id);
    const { data: interviews } = await supabaseAdmin
      .from("interviews")
      .select("id, application_id, interview_link, result_json, report_pdf_url, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false });

    const latestInterviewByApplication = new Map<string, {
      interview_link: string | null;
      report_pdf_url: string | null;
      candidate_report_pdf_url: string | null;
      score: number | null;
      created_at: string;
      completed: boolean;
    }>();

    for (const interview of interviews || []) {
      if (!interview?.application_id || latestInterviewByApplication.has(interview.application_id)) {
        continue;
      }

      latestInterviewByApplication.set(interview.application_id, {
        interview_link: interview.interview_link || null,
        report_pdf_url: interview.report_pdf_url || null,
        candidate_report_pdf_url: readCandidateReportUrl(interview.result_json),
        score: readInterviewScore(interview.result_json),
        created_at: interview.created_at,
        completed: !!interview.result_json
      });
    }

    const normalized = (applications || []).map((app: any) => {
      const latestInterview = latestInterviewByApplication.get(app.id);
      return {
      id: app.id,
      pipeline_id: app.pipeline_id,
      status: app.status,
      score: app.score,
      created_at: app.created_at,
      interview_link: latestInterview?.interview_link || null,
      interview_report_url: latestInterview?.candidate_report_pdf_url || latestInterview?.report_pdf_url || null,
      interview_score: latestInterview?.score ?? null,
      interview_completed: latestInterview?.completed || false,
      round_records: [
        { round: "applied", stage_order: 1, label: "Application submitted", at: app.created_at },
        {
          round: "status-mail",
          stage_order: 2,
          label: `Status update mail (${app.status || "pending"})`,
          at: app.created_at,
          inferred: true
        },
        ...(latestInterview && app.status !== "rejected"
          ? [
              {
                round: "interview-invite",
                stage_order: 3,
                label: "Interview invite sent",
                at: latestInterview.created_at,
                inferred: true
              },
              ...(latestInterview.completed
                ? [
                    {
                      round: "interview-complete",
                      stage_order: 4,
                      label: "Interview completed and reviewed",
                      at: latestInterview.created_at,
                      inferred: true
                    }
                  ]
                : [])
            ]
          : []),
        ...(app.status === "selected"
          ? [
              {
                round: "final-mail",
                stage_order: 5,
                label: "Final selection mail sent",
                at: app.created_at,
                inferred: true
              }
            ]
          : [])
      ],
      pipeline: {
        title: app.pipeline?.title || 'Position'
      }
    };
    });

    return apiResponse(true, { applications: normalized }, "Applications retrieved successfully", 200);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`application:${ip}`, 20, 60000)) {
      throw new APIError(429, "Too many applications submitted. Please try again later.");
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new APIError(401, "Authentication required. Please log in to apply.");
    }

    const body = await parseRequestBody(request);
    const parsed = createApplicationSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid application data", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const { pipeline_id, email, resume_text, storage_path, file_name, file_type, file_size } = parsed.data;

    if (!resume_text && !storage_path) {
      throw new APIError(400, "Please provide either resume text or a file upload.");
    }

    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, is_active, jd_text, threshold")
      .eq("id", pipeline_id)
      .single();

    if (pipelineErr || !pipeline) {
      throw new APIError(404, "Pipeline not found or has been deleted.");
    }

    if (!(pipeline as any).is_active) {
      throw new APIError(403, "This position is no longer accepting applications (Position Closed).");
    }

    const { data: existingApp, error: dupErr } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("pipeline_id", pipeline_id)
      .eq("candidate_id", user.id)
      .maybeSingle();

    if (!dupErr && existingApp) {
      throw new APIError(409, "You have already applied to this position. Please check your email for updates.");
    }

    let active_resume_text = resume_text || "";

    if (storage_path) {
      try {
        const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
          .from("resumes")
          .download(storage_path);

        if (downloadErr || !fileData) {
          throw new Error(`Failed to download file from storage: ${downloadErr?.message}`);
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const pdfData = await pdf(buffer);
        active_resume_text = pdfData.text;
      } catch (pdfErr) {
        console.error("PDF Parsing Error:", pdfErr);
      }
    }

    if (active_resume_text.length < 20) {
      throw new APIError(400, "Could not extract sufficient text from resume. Please try a different file.");
    }

    let screeningResult: any;
    try {
      screeningResult = analyzeResumeAgainstJd(active_resume_text, pipeline.jd_text || "");
    } catch (aiError) {
      console.error("AI Screening Error:", aiError);
      screeningResult = { score: 0, feedback: "Internal error during AI analysis." };
    }

    // Extract name and update user profile in Auth (adds Display Name & Role in Supabase Studio)
    const extractedName = extractNameFromResume(active_resume_text);
    try {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { 
          full_name: extractedName,
          role: "candidate"
        }
      });
    } catch (metaErr) {
      console.error("Failed to update user profile metadata", metaErr);
    }

    const { data: resume, error: resumeErr } = await supabaseAdmin
      .from("resumes")
      .insert({
        user_id: user.id,
        content: active_resume_text,
        storage_path: storage_path || null,
        file_name: file_name || null,
        file_type: file_type || null,
        file_size: file_size || null,
        metadata: { email, pipeline_id, source: storage_path ? "upload" : "text" }
      })
      .select("id")
      .single();

    if (resumeErr || !resume) {
      throw new APIError(500, "Failed to store resume record", { details: resumeErr?.message });
    }

    const { data: application, error: appErr } = await supabaseAdmin
      .from("applications")
      .insert({
        pipeline_id,
        candidate_id: user.id,
        resume_id: resume.id,
        status: screeningResult.score >= (pipeline.threshold || 70) ? "shortlisted" : "screened",
        score: screeningResult.score || 0,
        metadata: { 
          email, 
          feedback: screeningResult.feedback,
          applied_at: new Date().toISOString()
        }
      })
      .select("id, status, created_at")
      .single();

    if (appErr || !application) {
      throw new APIError(500, "Failed to create application record. Please try again.", {
        details: appErr?.message
      });
    }

    // Return success response
    return apiResponse(
      true,
      {
        application_id: application.id,
        status: application.status,
        created_at: application.created_at,
        message: "We received your application! Check your email for next steps."
      },
      "Application submitted successfully",
      201
    );
  } catch (error) {
    return apiError(error);
  }
}