"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/shared/supabase/client";
import { validateInterviewToken } from "@/shared/interview-security";
import { videoInterviewServerUrl } from "@/shared/video-interview";

interface Interview {
  id: string;
  application_id: string;
  interview_token: string;
  expires_at: string;
  is_used: boolean;
  scheduled_at?: string;
  notes?: string;
}

interface Application {
  id: string;
  candidate_id: string;
  resume_id: string;
  score: number;
  status: string;
}

export default function InterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const interviewId = params.id as string;
  const token = searchParams.get("token");

  const [interview, setInterview] = useState<Interview | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const loadInterview = async () => {
      try {
        setLoading(true);
        setError(null);

        // Validate token is provided
        if (!token) {
          throw new Error("Interview link is missing authentication token. Please check your email for the correct link.");
        }

        // Fetch interview record
        const { data: interviewData, error: interviewErr } = await supabase
          .from("interviews")
          .select("id, application_id, interview_token, expires_at, is_used, scheduled_at, notes")
          .eq("id", interviewId)
          .single();

        if (interviewErr || !interviewData) {
          throw new Error("Interview not found. It may have been cancelled or expired.");
        }

        setInterview(interviewData);

        // Validate token security
        const isValid = validateInterviewToken(
          token,
          interviewData.interview_token,
          interviewData.expires_at,
          interviewData.is_used
        );

        if (!isValid) {
          if (interviewData.is_used) {
            throw new Error("This interview link has already been used. Please contact the hiring team if you need another attempt.");
          }
          if (new Date(interviewData.expires_at) < new Date()) {
            throw new Error("This interview link has expired. Please contact the hiring team to request a new one.");
          }
          throw new Error("Invalid or tampered interview link. Please check your email for the correct link.");
        }

        // Fetch application details
        const { data: appData, error: appErr } = await supabase
          .from("applications")
          .select("id, candidate_id, resume_id, score, status")
          .eq("id", interviewData.application_id)
          .single();

        if (appErr || !appData) {
          throw new Error("Application not found.");
        }

        if (appData.status === "rejected") {
          throw new Error("This interview link is no longer active as your application status has been updated. Please contact the hiring team for more information.");
        }

        setApplication(appData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load interview";
        setError(message);
        console.error("Interview loading error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadInterview();
  }, [interviewId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interview || !application) return;

    try {
      setSubmitted(true);

      // Call the proper interview result endpoint to process the feedback
      const resultResponse = await fetch(
        `/api/interviews/${interview.id}/result`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            result_json: {
              overall_score: 65,
              summary: "Text-based interview feedback submitted",
              transcript: feedback,
              submission_type: "text_fallback",
              submitted_at: new Date().toISOString(),
              strengths: [],
              weaknesses: [],
              kpis: {},
              questions_answered: 1,
              max_questions: 1,
              ai_recommendation: "pending"
            },
            candidate_email: "",
            callback_token: token || "",
            decision: "pending"
          })
        }
      );

      if (!resultResponse.ok) {
        const errorData = await resultResponse.json();
        throw new Error(errorData?.error || "Failed to submit interview feedback");
      }

      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit feedback";
      setError(message);
      setSubmitted(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="inline-block animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
            <span className="text-red-600 text-xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Interview Link Error</h2>
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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-4">
            <span className="text-green-600 text-xl">✅</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Interview Submitted</h2>
          <p className="text-gray-600 text-center mb-6">
            Thank you! Your interview has been submitted and recorded. Your feedback is being processed and a report is being generated. The hiring team will review your responses and get back to you soon.
          </p>
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
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Interview Submission</h1>
          <p className="text-gray-600 mb-2">
            Video server unavailable? No problem. Submit your written responses below and we'll process them just like a video interview.
          </p>
          <p className="text-sm text-amber-600 mb-8 p-3 bg-amber-50 rounded-lg border border-amber-200">
            ⚠️ <strong>Note:</strong> This is a fallback option. We recommend using the video interview for the best experience.
          </p>

          {interview && (
            <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Interview ID:</strong> {interview.id.substring(0, 8)}...
              </p>
              {interview.scheduled_at && (
                <p className="text-sm text-blue-800 mt-1">
                  <strong>Scheduled:</strong> {new Date(interview.scheduled_at).toLocaleDateString()}
                </p>
              )}
              <p className="text-sm text-blue-800 mt-1">
                <strong>Expires:</strong> {new Date(interview.expires_at).toLocaleDateString()} at{" "}
                {new Date(interview.expires_at).toLocaleTimeString()}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-group">
              <label htmlFor="feedback" className="form-label">
                Interview Feedback & Responses
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Please share your feedback on this interview. Include your answers, observations, and any additional comments."
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                required
              />
              <p className="text-xs text-gray-500 mt-2">Minimum 10 characters</p>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={submitted || feedback.length < 10}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {submitted ? "Submitting..." : "Submit Interview"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => window.open(videoInterviewServerUrl, "_blank", "noopener,noreferrer")}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
              >
                Open Video Interview Server
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-4">Important Notice</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>✓ This interview link is valid for 72 hours from the time it was sent</li>
              <li>✓ This link can only be used once - further responses will not be accepted</li>
              <li>✓ Your feedback will be securely stored and reviewed by the hiring team</li>
              <li>✓ Do not share this link with anyone else</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}