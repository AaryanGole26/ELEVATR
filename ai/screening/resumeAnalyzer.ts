import type { ScreeningResult } from "@/shared/types";

const STOPWORDS = new Set([
  "about", "after", "again", "against", "their", "there", "these", "those", "would", "could", "should",
  "where", "which", "while", "your", "with", "from", "have", "been", "into", "that", "this", "when", "what",
  "were", "they", "them", "ours", "over", "under", "more", "most", "very", "just", "like", "than", "then",
  "also", "such", "used", "using", "does", "done", "role", "work", "years", "year", "tell", "give", "some",
  "many", "each", "across", "are", "highly", "seeking", "skilled", "strong", "excellent", "responsible", "ability",
  "requirements", "preferred", "mandatory", "must", "nice", "plus", "and", "the", "for", "you", "our", "will",
  "team", "looking", "experience", "knowledge", "good", "great", "who", "job", "description"
]);

const TECH_TERMS = [
  "python", "typescript", "javascript", "react", "next.js", "node", "sql", "postgresql", "docker", "kubernetes",
  "aws", "azure", "gcp", "tensorflow", "pytorch", "machine learning", "deep learning", "nlp", "computer vision",
  "data science", "scikit-learn", "fastapi", "flask", "django", "rest", "graphql"
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-term matching: a plain substring check counted "rest" in "restaurant" and "aws" in "laws".
const TECH_TERM_MATCHERS = TECH_TERMS.map((term) => ({
  term,
  pattern: new RegExp(`(?<![a-z0-9+#])${escapeRegExp(term)}(?![a-z0-9+#])`, "i")
}));

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((word) => word.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function detectSkills(text: string): string[] {
  return TECH_TERM_MATCHERS.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term);
}

export function analyzeResumeAgainstJd(resumeText: string, jdText: string): ScreeningResult {
  let required = detectSkills(jdText);
  let found = new Set(detectSkills(resumeText));

  // For roles without recognised technical terms, compare the job description's own vocabulary.
  // Previously these terms were checked against the technical skills only, so every resume for a
  // non-technical role scored 0.
  if (required.length === 0) {
    required = Array.from(new Set(tokenize(jdText))).slice(0, 20);
    found = new Set(tokenize(resumeText));
  }

  const matchedSkills = required.filter((skill) => found.has(skill));
  const missingSkills = required.filter((skill) => !found.has(skill));
  const denominator = Math.max(required.length, 1);
  const score = Math.round((matchedSkills.length / denominator) * 100);

  const feedback = [
    `Matched ${matchedSkills.length} out of ${denominator} key JD terms.`,
    missingSkills.length ? `Missing focus areas: ${missingSkills.slice(0, 8).join(", ")}.` : "Strong alignment with JD requirements.",
    score >= 70 ? "Candidate is suitable for shortlist." : "Candidate needs deeper review before shortlist."
  ].join(" ");

  return { score, feedback, matchedSkills, missingSkills };
}
