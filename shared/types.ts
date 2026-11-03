export type UserRole = "candidate" | "hr";

export const APPLICATION_STATUSES = [
  "pending",
  "screened",
  "shortlisted",
  "interview",
  "interviewed",
  "rejected",
  "selected"
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Pipeline = {
  id: string;
  hr_id: string;
  title: string;
  jd_text: string;
  tags: string[];
  threshold: number;
  is_active: boolean;
  created_at: string;
};

export type ScreeningResult = {
  score: number;
  feedback: string;
  matchedSkills: string[];
  missingSkills: string[];
};

export type InterviewConfig = {
  questions: string[];
  durationMinutes: number;
  maxQuestions?: number;
  focusAreas: string[];
};

export type InterviewKpi = "confidence" | "clarity" | "technical" | "communication" | "culture_fit";

export type KpiData = {
  score: number;
  feedback: string;
};

export type TranscriptTurn = { role: "interviewer" | "candidate"; text: string };

export type InterviewEvaluation = {
  overallScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  kpis: Record<InterviewKpi, KpiData>;
  transcript: TranscriptTurn[];
};

/** "complete": scored by the AI. "failed": saved for review and can be re-run with Reprocess. */
export type EvaluationStatus = "complete" | "failed";

export type InterviewEvaluationView = {
  overall_score: number | null;
  evaluation_status: EvaluationStatus;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  kpis: Partial<Record<InterviewKpi, KpiData>>;
  transcript: TranscriptTurn[];
  questions_answered: number;
  max_questions: number;
  proctor_violations: number;
  submission_type: string;
  report_url: string | null;
  interview_id: string;
  candidate_email: string;
  pipeline_title: string;
};
