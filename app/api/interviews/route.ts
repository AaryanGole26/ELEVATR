import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { generateInterviewConfig } from "@/ai/interviewer/engine";
import { env } from "@/shared/env";
import { sendEmail } from "@/shared/email";
import { interviewInviteEmail } from "@/shared/email-templates";
import { apiResponse, apiError, rateLimit, parseRequestBody, APIError, getClientIp } from "@/shared/api-utils";
import { generateInterviewExpiry, generateInterviewToken, INTERVIEW_LINK_TTL_HOURS } from "@/shared/interview-security";

const createInterviewSchema = z.object({
  application_id: z.string().uuid(),
  candidate_email: z.string().email(),
  duration_minutes: z.number().min(5).max(180).default(20),
  max_questions: z.number().int().min(1).max(30).default(8)
});

/** POST /api/interviews: schedules a single interview. Context always comes from the database. */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`interview:${getClientIp(request)}`, 10, 60_000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const guard = await requireRole("hr");
    if (!guard.ok) throw new APIError(guard.status, guard.message);

    const parsed = createInterviewSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) {
      throw new APIError(400, "Invalid request data", { errors: parsed.error.flatten().fieldErrors });
    }
    const { application_id, candidate_email, duration_minutes, max_questions } = parsed.data;

    const { data: application, error: appError } = await supabaseAdmin
      .from("applications")
      .select("id, status, pipelines!inner(hr_id, title, jd_text), resumes(content, parsed_content)")
      .eq("id", application_id)
      .maybeSingle();

    if (appError) throw new APIError(500, "Failed to load application", { details: appError.message });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = application as any;
    if (!row || row.pipelines?.hr_id !== guard.user.id) throw new APIError(404, "Application not found.");

    const resumeText = row.resumes?.parsed_content || row.resumes?.content || "";
    const token = generateInterviewToken();

    const { data: interview, error: createError } = await supabaseAdmin
      .from("interviews")
      .insert({
        application_id,
        config: generateInterviewConfig(row.pipelines.jd_text, resumeText, duration_minutes, max_questions),
        interview_token: token,
        expires_at: generateInterviewExpiry(),
        interview_status: "pending"
      })
      .select("id, application_id, created_at")
      .single();

    if (createError || !interview) {
      throw new APIError(500, "Failed to create interview", { details: createError?.message });
    }

    const interviewLink = `${env.appUrl}/video-interview/${interview.id}?token=${token}`;
    await supabaseAdmin.from("interviews").update({ interview_link: interviewLink }).eq("id", interview.id);
    await supabaseAdmin.from("applications").update({ status: "interview", email: candidate_email }).eq("id", application_id);

    const emailResult = await sendEmail({
      to: candidate_email,
      ...interviewInviteEmail({
        pipelineTitle: row.pipelines.title,
        questions: max_questions,
        minutes: duration_minutes,
        link: interviewLink,
        expiresInHours: INTERVIEW_LINK_TTL_HOURS
      })
    });

    return apiResponse(
      true,
      {
        interview: { ...interview, interview_link: interviewLink },
        email_sent: !emailResult.skipped
      },
      "Interview scheduled successfully",
      201
    );
  } catch (error) {
    return apiError(error);
  }
}
