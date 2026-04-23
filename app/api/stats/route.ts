import { NextRequest } from "next/server";
import { requireRole } from "@/shared/auth";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiResponse, apiError, rateLimit } from "@/shared/api-utils";

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`stats:${ip}`, 20, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    // Authentication - must be HR
    const guard = await requireRole("hr");
    if (!guard.ok) {
      throw new APIError(guard.status, guard.message);
    }

    // Get the HR's pipelines
    const { data: pipelines, error: pipelineErr } = await supabaseAdmin
      .from("pipelines")
      .select("id, title, created_at")
      .eq("hr_id", guard.user.id);

    if (pipelineErr) {
      throw new APIError(500, "Failed to fetch pipelines", { details: pipelineErr.message });
    }

    const pipelineIds = pipelines?.map((p) => p.id) || [];

    if (pipelineIds.length === 0) {
      // No pipelines - return empty stats
      return apiResponse(
        true,
        {
          total_pipelines: 0,
          active_pipelines: 0,
          total_applications: 0,
          applications_by_status: {
            pending: 0,
            screened: 0,
            shortlisted: 0,
            interview: 0,
            rejected: 0,
            selected: 0
          },
          average_score: 0,
          recent_applications: [],
          conversion_funnel: []
        },
        "No pipelines found",
        200
      );
    }

    // Get applications for these pipelines
    const { data: applications, error: appErr } = await supabaseAdmin
      .from("applications")
      .select("id, pipeline_id, candidate_id, resume_id, status, score, created_at")
      .in("pipeline_id", pipelineIds);

    if (appErr) {
      throw new APIError(500, "Failed to fetch applications", { details: appErr.message });
    }

    const candidateIds = Array.from(new Set((applications || []).map((app) => app.candidate_id).filter(Boolean)));
    const resumeIds = Array.from(new Set((applications || []).map((app) => app.resume_id).filter(Boolean)));

    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .in("id", candidateIds as string[]);

    const { data: resumes } = await supabaseAdmin
      .from("resumes")
      .select("id, metadata")
      .in("id", resumeIds);

    const applicationIds = (applications || []).map((app) => app.id);
    const { data: interviews } = await supabaseAdmin
      .from("interviews")
      .select("id, application_id, interview_link, report_pdf_url, result_json, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false });

    const userEmailMap = new Map((users || []).map((user) => [user.id, user.email]));
    const resumeEmailMap = new Map(
      (resumes || []).map((resume) => {
        const metadata = resume.metadata && typeof resume.metadata === "object" ? (resume.metadata as Record<string, unknown>) : null;
        const email = typeof metadata?.email === "string" ? metadata.email : null;
        return [resume.id, email] as const;
      })
    );

    const latestInterviewByApplication = new Map<string, {
      interview_link: string | null;
      report_pdf_url: string | null;
      result_json: unknown;
      created_at: string;
    }>();

    for (const interview of interviews || []) {
      if (!interview?.application_id || latestInterviewByApplication.has(interview.application_id)) {
        continue;
      }

      latestInterviewByApplication.set(interview.application_id, {
        interview_link: interview.interview_link || null,
        report_pdf_url: interview.report_pdf_url || null,
        result_json: interview.result_json,
        created_at: interview.created_at
      });
    }

    const pipelineTitleMap = new Map((pipelines || []).map((pipeline) => [pipeline.id, pipeline.title]));

    // Calculate statistics
    const stats = {
      total_pipelines: pipelines?.length || 0,
      active_pipelines: pipelines?.length || 0,
      total_applications: applications?.length || 0,
      applications_by_status: {
        pending: 0,
        screened: 0,
        shortlisted: 0,
        interview: 0,
        interviewed: 0,
        rejected: 0,
        selected: 0
      },
      average_score: 0,
      recent_applications: [] as any[],
      conversion_funnel: [] as any[],
      round_records: [] as any[]
    };

    if (applications && applications.length > 0) {
      // Count by status
      applications.forEach((app) => {
        const status = (app.status || "pending") as keyof typeof stats.applications_by_status;
        if (status in stats.applications_by_status) {
          stats.applications_by_status[status]++;
        }
      });

      // Calculate average score
      const scores = applications.filter((a) => a.score).map((a) => a.score);
      stats.average_score = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;

      // Recent applications (last 10)
      stats.recent_applications = applications
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10)
        .map((app) => ({
          id: app.id,
          email: (app.candidate_id ? userEmailMap.get(app.candidate_id) : null) || resumeEmailMap.get(app.resume_id) || "Unknown",
          status: app.status,
          score: app.score,
          created_at: app.created_at
        }));

      stats.round_records = applications
        .map((app) => {
          const latestInterview = latestInterviewByApplication.get(app.id);
          const interviewScore = latestInterview ? (latestInterview.result_json as any)?.overall_score || (latestInterview.result_json as any)?.overallScore || (latestInterview.result_json as any)?.score : null;
          const stageFlow = [
            { stage_order: 1, stage: "Applied", done: true, at: app.created_at },
            { stage_order: 2, stage: "Status Mail", done: true, at: app.created_at },
            {
              stage_order: 3,
              stage: "Interview Mail",
              done: !!latestInterview?.interview_link,
              at: latestInterview?.created_at || app.created_at
            },
            {
              stage_order: 4,
              stage: "Interview Completed",
              done: !!latestInterview?.result_json,
              at: latestInterview?.created_at || app.created_at
            },
            {
              stage_order: 5,
              stage: "Final Selection Mail",
              done: app.status === "selected",
              at: app.created_at
            }
          ];

          return {
            application_id: app.id,
            pipeline_title: pipelineTitleMap.get(app.pipeline_id) || "Pipeline",
            email: (app.candidate_id ? userEmailMap.get(app.candidate_id) : null) || resumeEmailMap.get(app.resume_id) || "Unknown",
            status: app.status,
            latest_interview_id: latestInterview?.interview_link ? latestInterview.interview_link.split('/').pop()?.split('?')[0] : null, // ID is usually in the link, but let's be safer
            latest_interview_score: typeof interviewScore === 'number' ? Math.round(interviewScore) : null,
            status_mail_sent: true,
            interview_mail_sent: !!latestInterview?.interview_link,
            interview_completed: !!latestInterview?.result_json,
            report_available: !!latestInterview?.report_pdf_url,
            final_mail_sent: app.status === "selected",
            updated_at: latestInterview?.created_at || app.created_at,
            stage_flow: stageFlow
          };
        })
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 100);

      // Conversion funnel
      const total = applications.length;
      stats.conversion_funnel = [
        {
          stage: "Applied",
          count: total,
          percentage: 100
        },
        {
          stage: "Screened",
          count: (stats.applications_by_status.screened || 0) + (stats.applications_by_status.shortlisted || 0),
          percentage: total > 0 ? Math.round((((stats.applications_by_status.screened || 0) + (stats.applications_by_status.shortlisted || 0)) / total) * 100) : 0
        },
        {
          stage: "Interview",
          count: (stats.applications_by_status.interview || 0) + (stats.applications_by_status.interviewed || 0),
          percentage: total > 0 ? Math.round((((stats.applications_by_status.interview || 0) + (stats.applications_by_status.interviewed || 0)) / total) * 100) : 0
        },
        {
          stage: "Selected",
          count: stats.applications_by_status.selected || 0,
          percentage: total > 0 ? Math.round(((stats.applications_by_status.selected || 0) / total) * 100) : 0
        }
      ];
    }

    return apiResponse(true, stats, "HR statistics retrieved successfully", 200);
  } catch (error) {
    return apiError(error);
  }
}
