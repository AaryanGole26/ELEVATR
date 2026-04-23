import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { analyzeResumeAgainstJd } from "@/ai/screening/resumeAnalyzer";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";

const screeningSchema = z.object({
  pipeline_id: z.string().uuid("Invalid pipeline ID").optional(),
  resume_text: z.string().min(20, "Resume must be at least 20 characters").max(50000, "Resume is too large"),
  jd_text: z.string().min(20, "Job description must be at least 20 characters").max(50000, "Job description is too large")
});

export async function POST(request: Request) {
  try {
    // Rate limiting - screening requires more compute so stricter limits
    const ip = request.headers.get("x-forwarded-for") || "unknown";
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
    let result: any;
    try {
      result = analyzeResumeAgainstJd(resume_text, jd_text);
    } catch (aiError) {
      throw new APIError(500, "Failed to analyze resume. Please try again.", {
        details: aiError instanceof Error ? aiError.message : "Unknown AI error"
      });
    }

    // Get current user for database storage
    const user = await getCurrentUser();

    // Store analysis if user authenticated and pipeline provided
    let analysisId: string | null = null;
    if (user && pipeline_id) {
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