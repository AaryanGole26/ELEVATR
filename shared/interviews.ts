import { createInterviewReportPdf } from "@/ai/report/pdf";
import { evaluateInterview } from "@/ai/interviewer/evaluator";
import { APIError } from "@/shared/api-utils";
import { supabaseAdmin } from "@/shared/supabase/admin";
import type { EvaluationStatus, InterviewEvaluationView, TranscriptTurn } from "@/shared/types";

/** Report files live in a private bucket; users reach them through /api/interviews/[id]/report. */
export function reportPath(interviewId: string, audience: "hr" | "candidate") {
  return audience === "hr" ? `interview-reports/${interviewId}.pdf` : `interview-reports/${interviewId}-candidate.pdf`;
}

export function reportRoute(interviewId: string, audience: "hr" | "candidate") {
  return `/api/interviews/${interviewId}/report?audience=${audience}`;
}

/** Reads the score from any historical result shape. Returns null, never 0, when there is no score. */
export function readInterviewScore(resultJson: unknown): number | null {
  if (!resultJson || typeof resultJson !== "object") return null;
  const payload = resultJson as Record<string, unknown>;
  for (const value of [payload.overallScore, payload.overall_score, payload.score, payload.final_score]) {
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }
  return null;
}

/** The transcript as text. Older rows stored it under different keys or as a list of turns. */
export function readRawTranscript(resultJson: unknown): string {
  if (!resultJson || typeof resultJson !== "object") return "";
  const payload = resultJson as Record<string, unknown>;
  for (const candidate of [payload.raw_transcript, payload.conversation, payload.transcript]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate) && candidate.length) {
      return (candidate as TranscriptTurn[])
        .map((turn) => `${turn.role === "candidate" ? "Candidate" : "Interviewer"}: ${turn.text}`)
        .join("\n");
    }
  }
  return "";
}

type InterviewContext = {
  id: string;
  application_id: string;
  result_json: Record<string, unknown> | null;
  application: { id: string; email: string | null; candidate_id: string | null };
  pipeline: { id: string; title: string; jd_text: string; hr_id: string };
  resumeText: string;
  candidateEmail: string;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function loadInterviewContext(interviewId: string): Promise<InterviewContext> {
  const { data, error } = await supabaseAdmin
    .from("interviews")
    .select(`
      id, application_id, result_json,
      applications!inner (
        id, email, candidate_id,
        pipelines!inner ( id, title, jd_text, hr_id ),
        resumes ( content, parsed_content, metadata ),
        users!candidate_id ( email )
      )
    `)
    .eq("id", interviewId)
    .maybeSingle();

  if (error) throw new APIError(500, "Failed to load interview", { details: error.message });
  if (!data) throw new APIError(404, "Interview not found.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const application = firstOf<any>(data.applications);
  const pipeline = firstOf<InterviewContext["pipeline"]>(application?.pipelines);
  if (!application || !pipeline) throw new APIError(404, "Interview not found.");

  const resume = firstOf<{ content: string | null; parsed_content: string | null; metadata: Record<string, unknown> | null }>(application.resumes);
  const account = firstOf<{ email: string }>(application.users);
  const metadataEmail = typeof resume?.metadata?.email === "string" ? resume.metadata.email : "";

  return {
    id: data.id,
    application_id: data.application_id,
    result_json: (data.result_json as Record<string, unknown> | null) ?? null,
    application: { id: application.id, email: application.email, candidate_id: application.candidate_id },
    pipeline,
    resumeText: resume?.parsed_content || resume?.content || "",
    candidateEmail: application.email || account?.email || metadataEmail
  };
}

/**
 * Evaluates a transcript, generates both PDFs and records the outcome. Shared by first-time
 * completion and HR reprocessing. If the AI is unavailable the interview is still saved, with
 * no score: a made-up number here could wrongly select or reject someone.
 */
export async function evaluateAndStore(
  context: InterviewContext,
  params: { transcript: string; base: Record<string, unknown> }
) {
  const evaluation = params.transcript.trim().length > 10
    ? await evaluateInterview(params.transcript, context.pipeline.jd_text, context.resumeText)
    : null;

  const evaluationStatus: EvaluationStatus = evaluation ? "complete" : "failed";
  const score = evaluation?.overallScore ?? null;

  // Deliberately not spreading old evaluation fields: a failed re-run must not keep a stale score.
  const result: Record<string, unknown> = {
    ...params.base,
    raw_transcript: params.transcript,
    evaluation_status: evaluationStatus,
    overallScore: score,
    overall_score: score,
    summary: evaluation?.summary ?? "The interview was recorded, but the AI evaluation has not completed yet.",
    strengths: evaluation?.strengths ?? [],
    weaknesses: evaluation?.weaknesses ?? [],
    kpis: evaluation?.kpis ?? {},
    transcript: evaluation?.transcript?.length ? evaluation.transcript : params.transcript,
    ai_recommendation: score !== null && score >= 70 ? "selected" : "pending"
  };

  const hrPath = reportPath(context.id, "hr");
  const candidatePath = reportPath(context.id, "candidate");

  for (const [audience, path] of [["hr", hrPath], ["candidate", candidatePath]] as const) {
    const pdf = await createInterviewReportPdf({
      applicationId: context.application_id,
      pipelineTitle: context.pipeline.title,
      candidateEmail: context.candidateEmail,
      resultJson: result,
      audience
    });
    const { error } = await supabaseAdmin.storage
      .from("reports")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new APIError(500, "Failed to store interview report", { details: error.message });
  }

  const { error: interviewError } = await supabaseAdmin
    .from("interviews")
    .update({
      result_json: result,
      report_pdf_url: hrPath,
      is_used: true,
      interview_status: "completed",
      completed_at: new Date().toISOString()
    })
    .eq("id", context.id);
  if (interviewError) throw new APIError(500, "Failed to save interview result", { details: interviewError.message });

  const { error: applicationError } = await supabaseAdmin
    .from("applications")
    .update({ status: "interviewed", latest_interview_score: score, latest_report_pdf_url: hrPath })
    .eq("id", context.application_id)
    // A candidate who already received a final decision keeps it when HR re-runs an evaluation.
    .not("status", "in", "(selected,rejected)");
  if (applicationError) throw new APIError(500, "Failed to update application", { details: applicationError.message });

  return { score, evaluationStatus };
}

/** Normalises stored results for the HR evaluation view. */
export function toEvaluationView(params: {
  interviewId: string;
  resultJson: unknown;
  hasReport: boolean;
  candidateEmail: string;
  pipelineTitle: string;
}): InterviewEvaluationView {
  const raw = (params.resultJson && typeof params.resultJson === "object" ? params.resultJson : {}) as Record<string, unknown>;
  const score = readInterviewScore(raw);
  const transcript: TranscriptTurn[] = Array.isArray(raw.transcript)
    ? (raw.transcript as TranscriptTurn[])
    : readRawTranscript(raw)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const isCandidate = /^(\*\*)?(you|candidate):/i.test(line);
          return {
            role: isCandidate ? ("candidate" as const) : ("interviewer" as const),
            text: line.replace(/^(\*\*)?(you|candidate|interviewer|🤖\s*interviewer):(\*\*)?\s*/i, "")
          };
        });

  return {
    overall_score: score,
    evaluation_status: raw.evaluation_status === "failed" || score === null ? "failed" : "complete",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    strengths: Array.isArray(raw.strengths) ? (raw.strengths as string[]) : [],
    weaknesses: Array.isArray(raw.weaknesses) ? (raw.weaknesses as string[]) : [],
    kpis: raw.kpis && typeof raw.kpis === "object" ? (raw.kpis as InterviewEvaluationView["kpis"]) : {},
    transcript,
    questions_answered: Number(raw.questions_answered) || 0,
    max_questions: Number(raw.max_questions) || 0,
    proctor_violations: Number(raw.proctor_violations) || 0,
    submission_type: typeof raw.submission_type === "string" ? raw.submission_type : "video",
    report_url: params.hasReport ? reportRoute(params.interviewId, "hr") : null,
    interview_id: params.interviewId,
    candidate_email: params.candidateEmail,
    pipeline_title: params.pipelineTitle
  };
}
