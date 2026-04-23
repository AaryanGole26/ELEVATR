import { z } from 'zod';
import { requireRole } from '@/shared/auth';
import { supabaseAdmin } from '@/shared/supabase/admin';
import { generateInterviewConfig } from '@/ai/interviewer/engine';
import { env } from '@/shared/env';
import { sendEmail } from '@/shared/email';
import {
  apiResponse,
  apiError,
  rateLimit,
  parseRequestBody,
  APIError
} from '@/shared/api-utils';
import { generateInterviewToken } from '@/shared/interview-security';

const createInterviewSchema = z.object({
  application_id: z.string().uuid(),
  jd_text: z.string().min(20),
  resume_text: z.string().min(20),
  candidate_email: z.string().email(),
  duration_minutes: z.number().min(5).max(120).default(20)
});

export async function POST(request: Request) {
  try {
    // Rate limiting: 10 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimit(`interview:${ip}`, 10, 60000)) {
      throw new APIError(429, 'Too many requests. Please try again later.');
    }

    // Auth check
    const guard = await requireRole('hr');
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    // Parse and validate request body
    const body = await parseRequestBody(request);
    const parsed = createInterviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, 'Invalid request data', { errors: parsed.error.flatten() });
    }

    const { application_id, jd_text, resume_text, candidate_email, duration_minutes } = parsed.data;

    // Verify application exists and belongs to a pipeline managed by this HR
    const { data: application, error: appError } = await supabaseAdmin
      .from('applications')
      .select('id, pipeline_id')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      throw new APIError(404, 'Application not found');
    }

    // Verify HR owns the pipeline
    const { data: pipeline, error: pipeError } = await supabaseAdmin
      .from('pipelines')
      .select('id, hr_id')
      .eq('id', application.pipeline_id)
      .eq('hr_id', guard.user.id)
      .single();

    if (pipeError || !pipeline) {
      throw new APIError(403, 'You do not have permission to schedule interviews for this pipeline');
    }

    // Generate interview config and security token
    const config = generateInterviewConfig(jd_text, resume_text, duration_minutes);
    const token = generateInterviewToken(application_id);

    // Create interview record
    const { data: interview, error: createError } = await supabaseAdmin
      .from('interviews')
      .insert({
        application_id,
        config,
        interview_token: token,
        interview_link: 'pending'
      })
      .select('id, application_id, created_at')
      .single();

    if (createError || !interview) {
      console.error('Interview creation error:', createError);
      throw new APIError(500, 'Failed to create interview');
    }

    // Generate secure interview link
    const interviewLink = `${env.appUrl}/video-interview/${interview.id}?token=${token}`;

    // Update interview with link
    await supabaseAdmin
      .from('interviews')
      .update({ interview_link: interviewLink })
      .eq('id', interview.id);

    // Send email to candidate
    const emailResult = await sendEmail({
      to: candidate_email,
      subject: 'Your ELEVATR Interview Invite',
      html: `
        <h2>Interview Scheduled</h2>
        <p>Your interview has been scheduled. Please click the link below to start:</p>
        <p><a href="${interviewLink}" style="padding: 10px 20px; background: #0b6dff; color: white; text-decoration: none;">Start Interview</a></p>
        <p><strong>Important:</strong> This link expires in 72 hours and can only be used once.</p>
        <hr />
        <p>If you did not expect this email, you can safely ignore it.</p>
      `
    });

    if (emailResult.skipped) {
      console.warn('Email sending skipped:', emailResult.reason);
    }

    return apiResponse(
      true,
      {
        interview: {
          id: interview.id,
          application_id: interview.application_id,
          interview_link: interviewLink,
          created_at: interview.created_at
        }
      },
      'Interview scheduled successfully',
      201
    );
  } catch (error) {
    return apiError(error);
  }
}