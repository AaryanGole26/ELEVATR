"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { videoInterviewServerUrl } from "@/shared/video-interview";
import { useAuth } from "@/shared/auth-context";

interface Interview {
  id: string;
  application_id: string;
  interview_token?: string;
  is_used?: boolean;
  scheduled_at?: string;
  config?: {
    durationMinutes?: number;
    maxQuestions?: number;
  };
}

interface Application {
  id: string;
  score: number;
  status: string;
  resume_id?: string;
  pipeline_id?: string;
  email?: string;
}

interface HandoffPayload {
  interview_id: string;
  candidate_email: string;
  resume_name: string;
  resume_text: string;
  job_desc: string;
  max_questions: number;
  time_limit_minutes: number;
  callback_url: string;
  callback_token: string;
}

export default function VideoInterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const interviewId = params.id as string;
  const token = searchParams.get("token");

  const [interview, setInterview] = useState<Interview | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [handoffPayload, setHandoffPayload] = useState<HandoffPayload | null>(null);
  
  const { user, loading: authLoading } = useAuth();

  const handleAction = (action: () => void) => {
    if (!user) {
      alert("Please sign in to your dashboard before continuing.");
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
      return;
    }
    action();
  };

  useEffect(() => {
    const loadInterview = async () => {
      try {
        setLoading(true);
        setError(null);

        const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
        const launchResponse = await fetch(`/api/interviews/${interviewId}/public${tokenQuery}`);
        const launchResult = await launchResponse.json();
        if (!launchResponse.ok) {
          throw new Error(launchResult?.message || "Interview not found. It may have been cancelled or expired.");
        }

        const interviewData = launchResult?.data?.interview;
        const appData = launchResult?.data?.application;
        const resumeData = launchResult?.data?.resume;
        const pipelineData = launchResult?.data?.pipeline;

        if (!interviewData || !appData) {
          throw new Error("Interview data could not be loaded.");
        }

        setInterview(interviewData);

        if (interviewData.is_used) {
          throw new Error("This interview link has already been used.");
        }

        const hasStoredToken = typeof interviewData.interview_token === "string" && interviewData.interview_token.length > 0;
        if (hasStoredToken && !token) {
          throw new Error("Interview link is missing authentication token. Please check your email for the correct link.");
        }

        if (hasStoredToken && token !== interviewData.interview_token) {
          throw new Error("Invalid or tampered interview link.");
        }

        setApplication(appData);

        setHandoffPayload({
          interview_id: interviewData.id,
          candidate_email: appData.email || "",
          resume_name: resumeData?.file_name || `resume_${interviewData.id}.txt`,
          resume_text: resumeData?.parsed_content || resumeData?.content || "",
          job_desc: pipelineData?.jd_text || "",
          max_questions: interviewData?.config?.maxQuestions || 8,
          time_limit_minutes: interviewData?.config?.durationMinutes || 20,
          callback_url: `${window.location.origin}/api/interviews/${interviewData.id}/result`,
          callback_token: token || ""
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interview");
      } finally {
        setLoading(false);
      }
    };

    loadInterview();

    fetch(videoInterviewServerUrl, { method: "GET" })
      .then((response) => setServerReady(response.ok))
      .catch(() => setServerReady(false));
  }, [interviewId, token]);

  const openVideoServer = async () => {
    try {
      if (!handoffPayload || !handoffPayload.job_desc) {
        window.open(`${videoInterviewServerUrl}/`, "_blank", "noopener,noreferrer");
        return;
      }

      const response = await fetch(`${videoInterviewServerUrl}/handoff-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handoffPayload)
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.launch_url) {
        throw new Error("Failed to hand off interview context to video server.");
      }

      // Open the video server in a new window
      const newWindow = window.open(`${videoInterviewServerUrl}${payload.launch_url}`, "_blank", "noopener,noreferrer");
      
      // Poll for interview completion every 5 seconds for up to 4 hours
      let pollCount = 0;
      const maxPolls = 2880; // 4 hours / 5 seconds
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        try {
          const statusResponse = await fetch(`/api/interviews/${interviewId}/public?token=${encodeURIComponent(token || "")}`);
          const statusData = await statusResponse.json();
          
          if (statusResponse.ok && statusData?.data?.interview?.is_used) {
            // Interview has been completed - close interval and redirect
            clearInterval(pollInterval);
            newWindow?.close();
            alert("Interview completed! Redirecting to dashboard to view your application status.");
            setTimeout(() => {
              router.push("/dashboard");
            }, 1000);
            return;
          }
        } catch (err) {
          // Silent fail on polling - just continue
        }
        
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
        }
      }, 5000);
    } catch {
      window.open(`${videoInterviewServerUrl}/`, "_blank", "noopener,noreferrer");
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="inline-block animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
          <p className="mt-4 text-gray-600 font-medium">Preparing video interview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Video Interview Error</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Video Interview Ready</h1>
            <p className="text-gray-600">
              This interview is handled by the separate AI video interviewer server.
            </p>
          </div>

          {interview && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
              <p className="text-sm text-blue-800"><strong>Interview ID:</strong> {interview.id.substring(0, 8)}...</p>
              <p className="text-sm text-blue-800"><strong>Server:</strong> {videoInterviewServerUrl}</p>
              <p className="text-sm text-blue-800"><strong>Server Status:</strong> {serverReady === null ? 'Checking...' : serverReady ? 'Online' : 'Unavailable'}</p>
              {application && (
                <p className="text-sm text-blue-800"><strong>Application Score:</strong> {application.score}/100</p>
              )}
              <p className="text-sm text-blue-800"><strong>Context Handoff:</strong> {handoffPayload?.job_desc ? 'Ready' : 'Limited (missing resume/job context)'}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleAction(openVideoServer)}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Open Video Interview Server
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => router.push(`/interview/${interviewId}?token=${token || ""}`))}
              className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
            >
              Use Text Feedback Fallback
            </button>
          </div>

          <div className="pt-6 border-t border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-2">How this works</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>✓ The Flask server at {videoInterviewServerUrl} handles the live interview experience.</li>
              <li>✓ If the server is unavailable, use the text feedback fallback page.</li>
              <li>✓ The link is still validated before the interview is launched.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
