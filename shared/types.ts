export type UserRole = "candidate" | "hr";

export type Pipeline = {
  id: string;
  hr_id: string;
  title: string;
  jd_text: string;
  tags: string[];
  threshold: number;
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

export type InterviewEvaluation = {
  overallScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  kpis: Record<InterviewKpi, KpiData>;
  transcript: Array<{ role: "interviewer" | "candidate"; text: string }>;
};