export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  gmailUser: process.env.GMAIL_USER || "",
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || "",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  // How the interview service reaches this app, when that differs from the public URL.
  internalAppUrl: (process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  googleApiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  interviewServiceUrl: (process.env.VIDEO_INTERVIEW_INTERNAL_URL || process.env.NEXT_PUBLIC_VIDEO_INTERVIEW_URL || "http://127.0.0.1:5001").replace(/\/$/, ""),
  interviewServicePublicUrl: (process.env.NEXT_PUBLIC_VIDEO_INTERVIEW_URL || "http://127.0.0.1:5001").replace(/\/$/, ""),
  interviewServiceSecret: process.env.INTERVIEW_SERVICE_SECRET || ""
};

export function assertServerEnv() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Supabase server environment variables are missing");
  }
}
