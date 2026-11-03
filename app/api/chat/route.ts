import { z } from "zod";
import { getCurrentRole, getCurrentUser } from "@/shared/auth";
import { env } from "@/shared/env";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, apiResponse, getClientIp, parseRequestBody, rateLimit } from "@/shared/api-utils";

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(30)
});

const PLATFORM_GUIDE = `ELEVATR is an AI hiring platform.
- HR creates a pipeline (job title, description, tags, minimum score) from "New pipeline" on the HR dashboard.
- Candidates apply with a PDF resume. It is screened against the job description and given a score from 0 to 100. A score at or above the pipeline minimum is shortlisted.
- On a pipeline page, "Notify candidates" sends shortlisted candidates a secure, one-time video interview link that expires after 72 hours, and sends others a status update.
- After the interview, an AI evaluation and a PDF report are generated. HR opens them with "AI Eval" and finalizes decisions on the pipeline page.
- Application stages: screened, shortlisted, interview, interviewed, then selected or rejected.
- Resume Tools offers a resume analyzer and a resume builder.`;

const STYLE = "Give direct, concise answers using the exact names of buttons and pages. Only state facts given here; if something is unknown, say so.";

async function candidateContext(userId: string) {
  const { data } = await supabaseAdmin
    .from("applications")
    .select("status, score, latest_interview_score, pipelines(title)")
    .eq("candidate_id", userId)
    .limit(20);

  if (!data?.length) return "This candidate has no applications yet.";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return "This candidate's applications:\n" + data.map((app: any) => {
    const title = (Array.isArray(app.pipelines) ? app.pipelines[0]?.title : app.pipelines?.title) || "Position";
    const interview = app.latest_interview_score != null ? `, interview score ${app.latest_interview_score}` : "";
    return `- ${title}: status ${app.status}, screening score ${app.score}${interview}`;
  }).join("\n");
}

async function hrContext(userId: string) {
  const { data } = await supabaseAdmin
    .from("pipelines")
    .select("title, threshold, is_active, applications(status)")
    .eq("hr_id", userId)
    .limit(20);

  if (!data?.length) return "This HR user has no pipelines yet.";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return "This HR user's pipelines:\n" + data.map((pipeline: any) =>
    `- ${pipeline.title}: ${pipeline.is_active ? "open" : "closed"}, minimum score ${pipeline.threshold}, ${pipeline.applications?.length ?? 0} applications`
  ).join("\n");
}

/**
 * POST /api/chat: the Neuro assistant. Runs on the server so the provider key stays private
 * and the context comes from the signed-in user's own records, never from the browser.
 */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`chat:${getClientIp(request)}`, 20, 60_000)) {
      throw new APIError(429, "You're sending messages quickly. Please wait a moment.");
    }

    const user = await getCurrentUser();
    if (!user) throw new APIError(401, "Please sign in to use the assistant.");

    const parsed = chatSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) throw new APIError(400, "Invalid message.");

    if (!env.groqApiKey) throw new APIError(503, "The assistant isn't configured yet.");

    const role = await getCurrentRole(user);
    const personal = role === "hr" ? await hrContext(user.id) : await candidateContext(user.id);
    const systemPrompt = `You are Neuro, the assistant inside ELEVATR, helping a ${role === "hr" ? "recruiter" : "candidate"}.\n\n${PLATFORM_GUIDE}\n\n${personal}\n\n${STYLE}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.groqApiKey}` },
      body: JSON.stringify({
        model: env.groqModel,
        messages: [{ role: "system", content: systemPrompt }, ...parsed.data.messages],
        max_tokens: 700
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      console.error("[Chat] Provider error:", response.status, (await response.text()).slice(0, 300));
      throw new APIError(503, "The assistant is unavailable right now. Please try again shortly.");
    }

    const payload = await response.json();
    const reply = payload?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new APIError(503, "The assistant is unavailable right now. Please try again shortly.");
    }

    return apiResponse(true, { reply });
  } catch (error) {
    return apiError(error);
  }
}
