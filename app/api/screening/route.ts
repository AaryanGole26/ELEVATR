import { z } from "zod";
import type { ScreeningResult } from "@/shared/types";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { analyzeResumeAgainstJd } from "@/ai/screening/resumeAnalyzer";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody, getClientIp } from "@/shared/api-utils";

const screeningSchema = z.object({
  pipeline_id: z.string().uuid("Invalid pipeline ID").optional(),
  resume_text: z.string().min(20, "Resume must be at least 20 characters").max(50000, "Resume is too large"),
  jd_text: z.string().min(20, "Job description must be at least 20 characters").max(50000, "Job description is too large")
});

export async function POST(request: Request) {
  try {
    // Keeps the endpoint from being an open, unauthenticated compute service.
    const user = await getCurrentUser();
    if (!user) {
      throw new APIError(401, "Authentication required.");
    }

    const ip = getClientIp(request);
    if (!rateLimit(`screening:${ip}`, 5, 60000)) {
      throw new APIError(429, "Too many screening requests. Please wait before submitting another analysis.");
    }

    // Parse and validate request body
    const body = await parseRequestBody(request);
    const parsed = screeningSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid screening data", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const { pipeline_id, resume_text, jd_text } = parsed.data;

    // Verify pipeline exists if provided
    if (pipeline_id) {
      const { data: pipeline, error: pipelineErr } = await supabaseAdmin
        .from("pipelines")
        .select("id, title")
        .eq("id", pipeline_id)
        .maybeSingle();

      if (pipelineErr || !pipeline) {
        throw new APIError(404, "Pipeline not found or has been deleted.");
      }
    }

    // Run screening analysis (AI module)
    let result: ScreeningResult;
    try {
      result = analyzeResumeAgainstJd(resume_text, jd_text);
    } catch (aiError) {
      console.error("Screening failed:", aiError);
      throw new APIError(500, "Failed to analyze resume. Please try again.");
    }

    // Store the analysis when it belongs to a pipeline
    let analysisId: string | null = null;
    if (pipeline_id) {
      try {
        // Store resume
        const { data: resume, error: resumeErr } = await supabaseAdmin
          .from("resumes")
          .insert({ 
            user_id: user.id, 
            content: resume_text,
            metadata: { pipeline_id, analyzed_at: new Date().toISOString() }
          })
          .select("id")
          .single();

        if (!resumeErr && resume?.id) {
          // Store analysis
          const { data: analysis, error: analysisErr } = await supabaseAdmin
            .from("analyses")
            .insert({
              resume_id: resume.id,
              pipeline_id,
              score: result.score || 0,
              feedback: result.feedback || "",
              metadata: { model: "resumeAnalyzer", timestamp: new Date().toISOString() }
            })
            .select("id")
            .single();

          if (!analysisErr && analysis?.id) {
            analysisId = analysis.id;
          }
        }
      } catch (dbError) {
        // Don't fail screening if database storage fails - just log it
        console.error("Failed to store screening analysis:", dbError);
      }
    }

    // Return success response
    return apiResponse(
      true,
      {
        score: result.score || 0,
        feedback: result.feedback || "",
        analysis_id: analysisId,
        stored: !!analysisId
      },
      "Resume analyzed successfully",
      200
    );
  } catch (error) {
    return apiError(error);
  }
}