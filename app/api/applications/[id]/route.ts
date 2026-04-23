import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";

const updateApplicationSchema = z.object({
  application_id: z.string().uuid("Invalid application ID"),
  status: z.enum(["pending", "screened", "shortlisted", "interview", "rejected", "selected"], {
    errorMap: () => ({ message: "Invalid status. Must be one of: pending, screened, shortlisted, interview, rejected, selected" })
  }),
  feedback: z.string().optional(),
  notes: z.string().max(1000).optional(),
  score: z.number().min(0).max(100).optional()
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`updateApp:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Authentication - must be HR
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: applicationId } = await context.params;

    // Parse and validate request body
    const body = await parseRequestBody(request);
    const parsed = updateApplicationSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid application update data", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const { status, feedback, notes, score } = parsed.data;

    // Fetch application and verify HR owns the pipeline
    const { data: application, error: fetchErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, status, candidate_id")
      .eq("id", applicationId)
      .single();

    if (fetchErr || !application) {
      throw new APIError(404, "Application not found.");
    }

    // Verify HR owns the pipeline
    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, hr_id")
      .eq("id", application.pipeline_id)
      .eq("hr_id", guard.user.id)
      .single();

    if (pipelineErr || !pipeline) {
      throw new APIError(403, "You don't have permission to update this application.");
    }

    // Update application
    const updateData: Record<string, any> = {
      status
    };

    if (score !== undefined) {
      updateData.score = score;
    }

    const { data: updatedApp, error: updateErr } = await supabaseAdmin
      .from("applications")
      .update(updateData)
      .eq("id", applicationId)
      .select("id, status, score")
      .single();

    if (updateErr || !updatedApp) {
      throw new APIError(500, "Failed to update application", {
        details: updateErr?.message
      });
    }

    // Send email notification if status changed
    if (application.status !== status) {
      try {
        // Email notifications would be sent here
        // For now, this is a placeholder - integrate with your email service
        console.log(`Status changed to ${status} for application ${application.id}`);
      } catch (emailErr) {
        console.error("Email notification failed:", emailErr);
        // Don't fail the request if email fails
      }
    }

    return apiResponse(
      true,
      {
        application_id: updatedApp.id,
        status: updatedApp.status,
        score: updatedApp.score
      },
      `Application updated to "${status}"`,
      200
    );
  } catch (error) {
    return apiError(error);
  }
}

// GET single application details
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`getApp:${ip}`, 50, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Authentication - must be HR
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    const { id: applicationId } = await context.params;

    // Fetch application
    const { data: application, error: fetchErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, candidate_id, resume_id, status, score, created_at")
      .eq("id", applicationId)
      .single();

    if (fetchErr || !application) {
      throw new APIError(404, "Application not found.");
    }

    // Verify HR owns the pipeline
    const { data: pipeline, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, hr_id")
      .eq("id", application.pipeline_id)
      .eq("hr_id", guard.user.id)
      .single();

    if (pipelineErr || !pipeline) {
      throw new APIError(403, "You don't have permission to access this application.");
    }

    // Fetch resume details
    const { data: resume } = await supabaseAdmin
      .from("resumes")
      .select("id, content, metadata")
      .eq("id", application.resume_id)
      .single();

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("id", application.candidate_id)
      .maybeSingle();

    // Fetch related interviews
    const { data: interviews } = await supabaseAdmin
      .from("interviews")
      .select("id, created_at")
      .eq("application_id", applicationId);

    return apiResponse(
      true,
      {
        application_id: application.id,
        candidate_id: application.candidate_id,
        status: application.status,
        score: application.score,
        created_at: application.created_at,
        email: user?.email || (resume?.metadata && typeof resume.metadata === "object" ? (resume.metadata as Record<string, unknown>).email || null : null),
        resume_text: resume?.content || null,
        resume: resume ? {
          id: resume.id,
          content: resume.content || null
        } : null,
        interviews: interviews || []
      },
      "Application details retrieved",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}
