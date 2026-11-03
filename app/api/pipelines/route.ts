import { z } from "zod";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit, parseRequestBody, getClientIp } from "@/shared/api-utils";

// Per-user data: never pre-render or cache this route.
export const dynamic = "force-dynamic";

const createPipelineSchema = z.object({
  job_title: z.string().min(3, "Job title must be at least 3 characters").max(100, "Job title must be less than 100 characters"),
  jd_text: z.string().min(20, "Job description must be at least 20 characters"),
  tags: z.array(z.string().min(1)).default([]),
  threshold: z.number().min(0, "Threshold must be >= 0").max(100, "Threshold must be <= 100").default(60)
});

export async function GET(request: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
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
      .select("id, title, tags, threshold, is_active, created_at, applications (id, status, score)")
      .eq("hr_id", guard.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new APIError(500, "Failed to fetch pipelines", { details: error.message });
    }

    // Return success response
    return apiResponse(
      true,
      {
        pipelines: (pipelines || []).map((pipeline) => {
          const apps = Array.isArray(pipeline.applications) ? pipeline.applications : [];
          const candidates = apps.length;
          const shortlisted = apps.filter((a) => ["shortlisted", "interview", "interviewed", "selected"].includes(a.status)).length;
          const scores = apps.map((a) => a.score).filter((score): score is number => typeof score === "number");
          const avgScore = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;

          return {
            ...pipeline,
            applications: undefined,
            job_title: pipeline.title,
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
    const ip = getClientIp(request);
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
      .select("id, title, jd_text, tags, threshold, is_active, created_at")
      .single();

    if (error) {
      throw new APIError(500, "Failed to create pipeline", {
        details: error.message
      });
    }

    return apiResponse(
      true,
      { pipeline: { ...pipeline, job_title: pipeline.title } },
      `Pipeline "${parsed.data.job_title}" created successfully`,
      201
    );
  } catch (error) {
    return apiError(error);
  }
}