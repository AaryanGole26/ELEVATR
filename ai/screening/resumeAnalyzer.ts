import type { ScreeningResult } from "@/shared/types";

const STOPWORDS = new Set([
  "about", "after", "again", "against", "their", "there", "these", "those", "would", "could", "should",
  "where", "which", "while", "your", "with", "from", "have", "been", "into", "that", "this", "when", "what",
  "were", "they", "them", "ours", "over", "under", "more", "most", "very", "just", "like", "than", "then",
  "also", "such", "used", "using", "does", "done", "role", "work", "years", "year", "tell", "give", "some",
  "many", "each", "across", "are", "highly", "seeking", "skilled", "strong", "excellent", "responsible", "ability",
  "requirements", "preferred", "mandatory", "must", "nice", "plus"
]);

const TECH_TERMS = [
  "python", "typescript", "javascript", "react", "next.js", "node", "sql", "postgresql", "docker", "kubernetes",
  "aws", "azure", "gcp", "tensorflow", "pytorch", "machine learning", "deep learning", "nlp", "computer vision",
  "data science", "scikit-learn", "fastapi", "flask", "django", "rest", "graphql"
];

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function detectSkills(text: string): string[] {
  const lowered = text.toLowerCase();
  return TECH_TERMS.filter((term) => lowered.includes(term));
}

export function analyzeResumeAgainstJd(resumeText: string, jdText: string): ScreeningResult {
  const jdSkills = new Set(detectSkills(jdText));
  const resumeSkills = new Set(detectSkills(resumeText));

  if (jdSkills.size === 0) {
    const jdTokens = tokenize(jdText).slice(0, 20);
    jdTokens.forEach((token) => jdSkills.add(token));
  }

  const matchedSkills = [...jdSkills].filter((s) => resumeSkills.has(s));
  const missingSkills = [...jdSkills].filter((s) => !resumeSkills.has(s));
  const denominator = Math.max(jdSkills.size, 1);
  const score = Math.round((matchedSkills.length / denominator) * 100);

  const feedback = [
    `Matched ${matchedSkills.length} out of ${denominator} key JD terms.`,
    missingSkills.length ? `Missing focus areas: ${missingSkills.slice(0, 8).join(", ")}.` : "Strong alignment with JD requirements.",
    score >= 70 ? "Candidate is suitable for shortlist." : "Candidate needs deeper review before shortlist."
  ].join(" ");

  return {
    score,
    feedback,
    matchedSkills,
    missingSkills
  };
}