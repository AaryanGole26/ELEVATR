import type { InterviewConfig } from "@/shared/types";

const FALLBACK_QUESTIONS = [
  "Walk me through the most relevant project in your resume for this role.",
  "What was the hardest technical decision you made in that project and why?",
  "How did you measure impact, and what would you improve next time?",
  "Describe a challenge where your initial approach failed and how you recovered.",
  "Which skills in this JD are your strongest and which need more depth?"
];

function extractTopics(jdText: string, resumeText: string): string[] {
  const source = `${jdText} ${resumeText}`.toLowerCase();
  const candidates = [
    "machine learning",
    "python",
    "sql",
    "data analysis",
    "react",
    "next.js",
    "system design",
    "communication"
  ];

  return candidates.filter((term) => source.includes(term)).slice(0, 5);
}

export function generateInterviewConfig(
  jdText: string,
  resumeText: string,
  durationMinutes = 20,
  maxQuestions = 8
): InterviewConfig {
  const focusAreas = extractTopics(jdText, resumeText);
  const baseQuestions = focusAreas.length
    ? focusAreas.map((topic) => `Explain your practical experience with ${topic} and its business impact.`)
    : FALLBACK_QUESTIONS;
  const questionCount = Math.max(1, Math.min(maxQuestions, 30));
  const questions = baseQuestions.slice(0, questionCount);

  return {
    questions,
    durationMinutes,
    maxQuestions: questionCount,
    focusAreas
  };
}

export function summarizeInterviewResult(resultJson: unknown): { overallScore: number; highlights: string[] } {
  const raw = typeof resultJson === "object" && resultJson !== null ? (resultJson as Record<string, unknown>) : {};
  const score = typeof raw.overallScore === "number" ? raw.overallScore : 0;
  const highlights = Array.isArray(raw.highlights) ? raw.highlights.filter((x): x is string => typeof x === "string") : [];
  return { overallScore: score, highlights };
}