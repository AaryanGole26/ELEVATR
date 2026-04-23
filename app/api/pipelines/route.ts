import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody } from "@/shared/api-utils";

const createPipelineSchema = z.object({
  job_title: z.string().min(3, "Job title must be at least 3 characters").max(100, "Job title must be less than 100 characters"),
  jd_text: z.string().min(20, "Job description must be at least 20 characters"),
  tags: z.array(z.string().min(1)).default([]),
  threshold: z.number().min(0, "Threshold must be >= 0").max(100, "Threshold must be <= 100").default(60)
});

export async function GET(request: Request) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:list:${ip}`, 30, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Authentication
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    // Fetch pipelines
    const { data: pipelines, error } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, tags, threshold, created_at, applications (id, status)")
      .eq("hr_id", guard.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new APIError(500, "Failed to fetch pipelines", { details: error.message });
    }

    const allApplicationIds = (pipelines || []).flatMap(p => 
      Array.isArray(p.applications) ? p.applications.map((a: any) => a.id) : []
    );

    let interviewMap = new Map<string, number>();
    if (allApplicationIds.length > 0) {
      const { data: interviews } = await supabaseAdmin
        .from("interviews")
        .select("application_id, result_json")
        .in("application_id", allApplicationIds);
      
      (interviews || []).forEach(i => {
        if (i.result_json && !interviewMap.has(i.application_id)) {
          // Simplistic extraction of score
          const payload = i.result_json as Record<string, any>;
          const score = payload.overall_score || payload.overallScore || payload.score;
          if (typeof score === 'number') {
            interviewMap.set(i.application_id, score);
          }
        }
      });
    }

    // Return success response
    return apiResponse(
      true,
      {
        pipelines: (pipelines || []).map((pipeline) => {
          const apps = Array.isArray(pipeline.applications) ? pipeline.applications : [];
          const candidates = apps.length;
          const shortlisted = apps.filter(a => a.status === 'selected').length;
          
          let totalScore = 0;
          let scoredCount = 0;
          apps.forEach((a: any) => {
            const score = interviewMap.get(a.id);
            if (score !== undefined) {
              totalScore += score;
              scoredCount++;
            }
          });
          const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

          return {
            ...pipeline,
            job_title: pipeline.title,
            is_active: true,
            _stats: { candidates, avg_score: avgScore, shortlisted }
          };
        })
      },
      `Retrieved ${pipelines?.length || 0} pipelines`,
      200
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`pipeline:create:${ip}`, 10, 60000)) {
      throw new APIError(429, "Too many pipeline creations. Please try again later.");
    }

    // Authentication
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    // Parse and validate request body
    const body = await parseRequestBody(request);
    const parsed = createPipelineSchema.safeParse(body);

    if (!parsed.success) {
      throw new APIError(400, "Invalid pipeline data", {
        errors: parsed.error.flatten().fieldErrors
      });
    }

    // Create pipeline
    const payload = {
      hr_id: guard.user.id,
      title: parsed.data.job_title,
      jd_text: parsed.data.jd_text,
      tags: parsed.data.tags,
      threshold: parsed.data.threshold,
    };

    const { data: pipeline, error } = await supabaseAdmin
      .from("pipelines")
      .insert(payload)
      .select("id, title, tags, threshold, created_at")
      .single();

    if (error) {
      throw new APIError(500, "Failed to create pipeline", {
        details: error.message
      });
    }

    return apiResponse(
      true,
      { pipeline: { ...pipeline, job_title: pipeline.title, is_active: true } },
      `Pipeline "${parsed.data.job_title}" created successfully`,
      201
    );
  } catch (error) {
    return apiError(error);
  }
}