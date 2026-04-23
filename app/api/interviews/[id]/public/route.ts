import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/shared/supabase/admin";
import { APIError, apiError, apiResponse, rateLimit } from "@/shared/api-utils";

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message = (error as { message?: string }).message || "";
  return message.includes(`Could not find the '${column}' column`);
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(`interview:public:${ip}`, 60, 60000)) {
      throw new APIError(429, "Too many requests. Please try again later.");
    }

    const { id: interviewId } = await context.params;
    const token = (request.nextUrl.searchParams.get("token") || "").trim();

    // Minimal interview fetch - just get what we need
    const { data: interview, error: interviewErr } = await supabaseAdmin
      .from("interviews")
      .select("*")
      .eq("id", interviewId)
      .maybeSingle();

    if (interviewErr || !interview) {
      throw new APIError(404, "Interview not found");
    }

    // Get application - minimal fields
    const { data: application } = await supabaseAdmin
      .from("applications")
      .select("*")
      .eq("id", interview.application_id)
      .maybeSingle();

    // Check if interview has already been used
    if (interview.is_used) {
      throw new Error("This interview link has already been used and cannot be accessed again. Please contact the hiring team if you need to retake the interview.");
    }

    if (application?.status === "rejected") {
      throw new Error("This interview link is no longer active as your application status has been updated. Please contact the hiring team for more information.");
    }

    // Get resume - minimal fields
    const { data: resume } = application?.resume_id
      ? await supabaseAdmin
          .from("resumes")
          .select("*")
          .eq("id", application.resume_id)
          .maybeSingle()
      : { data: null };

    // Get user email
    const { data: user } = application?.candidate_id
      ? await supabaseAdmin
          .from("users")
          .select("email")
          .eq("id", application.candidate_id)
          .maybeSingle()
      : { data: null };

    // Get pipeline
    const { data: pipeline } = application?.pipeline_id
      ? await supabaseAdmin
          .from("pipelines")
          .select("*")
          .eq("id", application.pipeline_id)
          .maybeSingle()
      : { data: null };

    // Build safe response
    const responseData = {
      interview: interview || {},
      application: application ? { ...application, email: user?.email || "" } : null,
      resume: resume || null,
      pipeline: pipeline || null
    };

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Interview public endpoint error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
