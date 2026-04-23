import { env } from "@/shared/env";
import type { InterviewEvaluation, InterviewKpi } from "@/shared/types";

// Dynamic import to avoid build errors if dependency is missing
async function getGenAI() {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    return new GoogleGenerativeAI(env.googleApiKey || "");
  } catch (err) {
    console.error("Generative AI library is not installed yet:", err);
    return null;
  }
}

const PROMPT = `
You are an expert AI HR Evaluator. Analyze the following interview transcript against the Job Description (JD) and Resume.
Your goal is to provide a professional, data-driven evaluation of the candidate.

Return only a valid JSON object with the following structure:
{
  "overallScore": number (0-100),
  "summary": "comprehensive summary of the interview performance",
  "strengths": ["list", "of", "strengths"],
  "weaknesses": ["list", "of", "weaknesses"],
  "kpis": {
    "confidence": { "score": number, "feedback": "reasoning" },
    "clarity": { "score": number, "feedback": "reasoning" },
    "technical": { "score": number, "feedback": "reasoning" },
    "communication": { "score": number, "feedback": "reasoning" },
    "culture_fit": { "score": number, "feedback": "reasoning" }
  },
  "transcript": [{"role": "interviewer", "text": "string"}, {"role": "candidate", "text": "string"}]
}

JD Context:
{{JD_TEXT}}

Resume Context:
{{RESUME_TEXT}}

Transcript:
{{TRANSCRIPT}}
`;

export async function evaluateInterview(
  transcript: string,
  jdText: string,
  resumeText: string
): Promise<InterviewEvaluation | null> {
  console.log("[Evaluator] Starting evaluation...");
  console.log("[Evaluator] API Key available:", !!env.googleApiKey);
  console.log("[Evaluator] Input sizes - Transcript: " + transcript.length + ", JD: " + jdText.length + ", Resume: " + resumeText.length);

  if (!env.googleApiKey) {
    console.warn("[Evaluator] GOOGLE_API_KEY is missing, skipping AI evaluation.");
    return null;
  }

  const genAI = await getGenAI();
  if (!genAI) {
    console.error("[Evaluator] AI Evaluation library is not available.");
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const filledPrompt = PROMPT
      .replace("{{JD_TEXT}}", jdText)
      .replace("{{RESUME_TEXT}}", resumeText)
      .replace("{{TRANSCRIPT}}", transcript);

    console.log("[Evaluator] Sending to Gemini API...");
    const result = await model.generateContent(filledPrompt);
    const response = await result.response;
    const text = response.text();

    console.log("[Evaluator] Gemini response received, length: " + text.length);

    // Clean up response text if needed (sometimes Gemini adds ```json block)
    const jsonStr = text.startsWith("```json") 
      ? text.replace(/^```json/, "").replace(/```$/, "") 
      : text;

    const evaluation = JSON.parse(jsonStr) as InterviewEvaluation;
    console.log("[Evaluator] Parsed evaluation - Score: " + evaluation.overallScore + ", Strengths: " + (evaluation.strengths?.length || 0));
    return evaluation;
  } catch (error) {
    console.error("[Evaluator] Evaluation failed:", error);
    return null;
  }
}
