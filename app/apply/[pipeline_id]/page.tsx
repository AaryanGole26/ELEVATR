"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
const supabase = createClient();

interface Pipeline {
  id: string;
  title: string;
  jd_text: string;
  threshold: number;
  is_active?: boolean;
}

export default function ApplyPage() {
  const params = useParams();
  const router = useRouter();
  const pipelineId = params.pipeline_id as string;

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const loadPipeline = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch pipeline details
        const { data, error: err } = await supabase
          .from("pipelines")
          .select("id, title, jd_text, threshold")
          .eq("id", pipelineId)
          .single();

        if (err || !data) {
          throw new Error("Pipeline not found. It may have been deleted or the link is invalid.");
        }

        setPipeline(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load pipeline";
        setError(message);
        console.error("Pipeline loading error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPipeline();
  }, [pipelineId]);

  const validateForm = (): boolean => {
    setFormError(null);

    if (!email || !email.includes("@")) {
      setFormError("Please enter a valid email address");
      return false;
    }

    if (!resumeFile) {
      setFormError("Please upload your resume PDF");
      return false;
    }

    if (resumeFile.size > 5 * 1024 * 1024) {
      setFormError("Resume file is too large (max 5MB)");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !pipeline || !resumeFile) return;

    try {
      setSubmitting(true);
      setFormError(null);

      // 1. Upload to Supabase Storage
      const fileExt = resumeFile.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `applications/${pipelineId}/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from("resumes")
        .upload(filePath, resumeFile);

      if (uploadErr) {
        throw new Error(`Failed to upload resume: ${uploadErr.message}`);
      }

      // 2. Submit application
      const appRes = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          email,
          storage_path: filePath,
          file_name: resumeFile.name,
          file_type: resumeFile.type,
          file_size: resumeFile.size,
          status: "screened"
        })
      });

      const appData = await appRes.json();

      if (!appRes.ok) {
        const message = appData.error?.message || appData.error?.details || "Failed to submit application";
        throw new Error(message);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit application";
      setFormError(message);
      console.error("Application submission error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="inline-block animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading application form...</p>
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
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Cannot Apply</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Back to Home
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
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Application Submitted!</h2>
          <p className="text-gray-600 text-center mb-2">
            Your application has been received and screened by our AI system.
          </p>
              <p className="text-xs text-gray-500 mt-2">
                PDF format preferred. Please ensure your contact details are clear.
              </p>
          <p className="text-sm text-gray-500 text-center">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Apply Now</h1>
          <p className="text-gray-600 mb-8">
            {pipeline && <span>Position: <strong>{pipeline.title}</strong></span>}
          </p>

          {pipeline && (
            <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg max-h-48 overflow-y-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Job Description</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{pipeline.jd_text}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Upload Resume (PDF) *</label>
              <div className={`file-upload-box ${resumeFile ? "has-file" : ""}`} style={{
                border: "2px dashed #cbd5e1",
                borderRadius: "12px",
                padding: "32px",
                textAlign: "center",
                background: "#f8fafc",
                cursor: "pointer",
                transition: "all 0.2s"
              }} onClick={() => document.getElementById("resume-input")?.click()}>
                <input
                  id="resume-input"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  style={{ display: "none" }}
                  disabled={submitting}
                />
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>{resumeFile ? "📄" : "📁"}</div>
                {resumeFile ? (
                  <div>
                    <strong style={{ color: "#2563eb" }}>{resumeFile.name}</strong>
                    <p className="m-0" style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                      {(resumeFile.size / 1024).toFixed(1)} KB · Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <strong>Choose a PDF file</strong>
                    <p className="m-0" style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                      Max size 5MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={submitting || !email || !resumeFile}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="font-semibold text-gray-700 mb-4">How It Works</h3>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>We review your resume using AI screening</li>
              <li>You'll receive an email with your screening results</li>
              <li>If you pass, we'll invite you for the next round</li>
              <li>The interview is conducted via secure link from your email</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}