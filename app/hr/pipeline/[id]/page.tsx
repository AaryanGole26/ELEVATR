"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/shared/auth-context";
import "./pipeline-detail.css";
import { AuthGuard } from "@/shared/components/AuthGuard";

type Pipeline = {
  id: string;
  job_title: string;
  jd_text: string;
  threshold: number;
  tags: string[];
  created_at: string;
  is_active?: boolean;
};

type Application = {
  id: string;
  candidate_id: string | null;
  resume_id: string;
  email: string;
  email_source?: string;
  status: string;
  score: number | null;
  created_at: string;
  resume_preview?: string;
  resume_length?: number;
  latest_interview_id?: string | null;
  latest_interview_score?: number | null;
  latest_interview_recommendation?: "selected" | "pending" | null;
  latest_report_pdf_url?: string | null;
  latest_interview_at?: string | null;
};

type PipelineResponse = {
  pipeline: Pipeline;
  applications: Application[];
  stats: {
    candidates: number;
    avg_score: number;
    shortlisted: number;
  };
};

type PipelineEditForm = {
  job_title: string;
  jd_text: string;
  tags: string;
  threshold: number;
};

type ResumeDetails = {
  id: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  content: string | null;
  parsed_content: string | null;
  metadata: Record<string, unknown> | null;
  storage_path: string | null;
  view_url: string | null;
};

type InterviewKpi = "confidence" | "clarity" | "technical" | "communication" | "culture_fit";

type KpiData = {
  score: number;
  feedback: string;
};

type InterviewEvaluation = {
  overallScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  kpis: Record<InterviewKpi, KpiData>;
  transcript: Array<{ role: "interviewer" | "candidate"; text: string }>;
};

export default function HRPipelineDetailPage() {
  return (
    <AuthGuard requiredRole="hr">
      <PipelineDetailContent />
    </AuthGuard>
  );
}

function PipelineDetailContent() {
  const params = useParams();
  const router = useRouter();
  const pipelineId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchSummary, setBatchSummary] = useState<{
    total_received: number;
    created: number;
    shortlisted: number;
    screened: number;
    failed: Array<{ index: number; file_name: string; reason: string }>;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [editError, setEditError] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [notifySummary, setNotifySummary] = useState<{
    total_applications: number;
    attempted: number;
    notified: number;
    interview_links_sent: number;
    skipped: number;
    sent_to: Array<{
      application_id: string;
      email: string;
      status: string;
      source: string;
      interview_link?: string;
    }>;
    failures: Array<{ application_id: string; reason: string }>;
  } | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState(8);
  const [interviewMinutes, setInterviewMinutes] = useState(20);
  const [manualEmails, setManualEmails] = useState("");
  const [inlineEmails, setInlineEmails] = useState<Record<string, string>>({});
  const [finalizeMode, setFinalizeMode] = useState<"manual" | "ai">("manual");
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const [finalizeSummary, setFinalizeSummary] = useState<{
    selected_count: number;
    emails_sent: number;
    skipped: number;
    selected_ids: string[];
    failures: Array<{ application_id: string; reason: string }>;
  } | null>(null);
  const [selectedForFinalRound, setSelectedForFinalRound] = useState<Record<string, boolean>>({});
  const [aiCutoffScore, setAiCutoffScore] = useState(70);
  const [resumeLoadingId, setResumeLoadingId] = useState<string | null>(null);
  const [selectedResume, setSelectedResume] = useState<ResumeDetails | null>(null);
  const [selectedResumeApplications, setSelectedResumeApplications] = useState<Array<{ id: string; pipeline_title: string; status: string; score: number | null; created_at: string }>>([]);
  const [resumeError, setResumeError] = useState("");
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [evaluationLoadingId, setEvaluationLoadingId] = useState<string | null>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<InterviewEvaluation | null>(null);
  const [editForm, setEditForm] = useState<PipelineEditForm>({
    job_title: "",
    jd_text: "",
    tags: "",
    threshold: 70
  });

  const loadPipeline = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/pipelines/${pipelineId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Failed to load pipeline details");
      }

      const loadedData = result?.data || null;
      setData(loadedData);
      if (loadedData?.pipeline) {
        setEditForm({
          job_title: loadedData.pipeline.job_title || "",
          jd_text: loadedData.pipeline.jd_text || "",
          tags: (loadedData.pipeline.tags || []).join(", "),
          threshold: loadedData.pipeline.threshold || 70
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline details");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pipelineId) {
      loadPipeline();
    }
  }, [pipelineId]);

  const handleBatchProcess = async () => {
    setBatchError("");
    setBatchSummary(null);

    if (bulkFiles.length === 0) {
      setBatchError("Upload at least one PDF resume.");
      return;
    }

    try {
      setBatchLoading(true);
      const formData = new FormData();
      bulkFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`/api/pipelines/${pipelineId}/batch`, {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Failed to process batch resumes");
      }

      setBatchSummary(result?.data || null);
      setBulkFiles([]);
      await loadPipeline();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Failed to process batch resumes");
    } finally {
      setBatchLoading(false);
    }
  };

  const handleSavePipeline = async () => {
    setEditError("");
    if (!editForm.job_title.trim() || !editForm.jd_text.trim()) {
      setEditError("Title and job description are required.");
      return;
    }

    try {
      setSavingPipeline(true);
      const response = await fetch(`/api/pipelines/${pipelineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: editForm.job_title.trim(),
          jd_text: editForm.jd_text.trim(),
          tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          threshold: Number(editForm.threshold)
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to update pipeline");
      }

      setIsEditing(false);
      await loadPipeline();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update pipeline");
    } finally {
      setSavingPipeline(false);
    }
  };

  const handleNotifyCandidates = async () => {
    setNotifyError("");
    setNotifySummary(null);

    try {
      setNotifyLoading(true);
      const response = await fetch(`/api/pipelines/${pipelineId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual_emails_text: manualEmails,
          inline_emails: inlineEmails,
          interview_questions: interviewQuestions,
          interview_minutes: interviewMinutes
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to notify candidates");
      }

      setNotifySummary(result?.data || null);
    } catch (err) {
      setNotifyError(err instanceof Error ? err.message : "Failed to notify candidates");
    } finally {
      setNotifyLoading(false);
    }
  };

  const toggleSelectedCandidate = (applicationId: string) => {
    setSelectedForFinalRound((prev) => ({
      ...prev,
      [applicationId]: !prev[applicationId]
    }));
  };

  const handleFinalizeCandidates = async (action: "pass" | "reject" = "pass") => {
    setFinalizeError("");
    setFinalizeSummary(null);

    try {
      setFinalizeLoading(true);
      const selectedIds = Object.entries(selectedForFinalRound)
        .filter(([, selected]) => selected)
        .map(([id]) => id);

      const response = await fetch(`/api/pipelines/${pipelineId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: finalizeMode,
          selected_application_ids: selectedIds,
          ai_cutoff_score: aiCutoffScore,
          action
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to finalize candidates");
      }

      const summary = result?.data;
      const count = summary?.selected_count || 0;
      const errors = summary?.failures || [];

      alert(`Finalization complete. Successful: ${count}, Failed: ${errors.length}.`);
      if (errors.length === 0 && data?.pipeline?.is_active) {
        if (window.confirm("Candidates notified! Would you like to close this opportunity to new applicants now?")) {
          await handleToggleStatus(false);
        }
      }
      await loadPipeline();
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "Failed to finalize candidates");
    } finally {
      setFinalizeLoading(false);
    }
  };

  const handleToggleStatus = async (explicitStatus?: boolean) => {
    if (!data?.pipeline) return;
    setSavingPipeline(true);
    setEditError("");
    try {
      const newStatus = typeof explicitStatus === "boolean" ? explicitStatus : !data.pipeline.is_active;
      const response = await fetch(`/api/pipelines/${pipelineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: data.pipeline.job_title,
          jd_text: data.pipeline.jd_text,
          tags: data.pipeline.tags,
          threshold: data.pipeline.threshold,
          is_active: newStatus
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || "Failed to toggle status");
      await loadPipeline();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to toggle status");
    } finally {
      setSavingPipeline(false);
    }
  };

  const handleViewResume = async (application: Application) => {
    if (!application.resume_id) {
      setResumeError("This application does not have a linked resume record.");
      return;
    }

    setResumeError("");
    setResumeLoadingId(application.id);
    try {
      const response = await fetch(`/api/resumes/${application.resume_id}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Failed to load resume");
      }

      setSelectedResume(result?.data?.resume || null);
      setSelectedResumeApplications(result?.data?.applications || []);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to load resume");
      setSelectedResume(null);
      setSelectedResumeApplications([]);
    } finally {
      setResumeLoadingId(null);
    }
  };

  const handleViewEvaluation = async (application: Application) => {
    if (!application.latest_interview_id) {
      setResumeError("This application does not have a completed interview report.");
      return;
    }

    setResumeError("");
    setEvaluationLoadingId(application.id);
    try {
      const response = await fetch(`/api/interviews/${application.latest_interview_id}/public`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Failed to load evaluation");
      }

      const interviewData = result?.data?.interview || {};
      const evalData = interviewData.result_json as InterviewEvaluation;
      
      if (!evalData || !evalData.overallScore) {
        throw new Error("Detailed evaluation data is not available for this interview yet.");
      }

      setSelectedEvaluation(evalData);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to load evaluation");
      setSelectedEvaluation(null);
    } finally {
      setEvaluationLoadingId(null);
    }
  };

  const handleDeleteResume = async (application: Application) => {
    if (!application.resume_id) {
      setResumeError("This application does not have a linked resume record.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this resume record? This will also remove linked applications, analyses, and stored CV files."
    );

    if (!confirmed) {
      return;
    }

    setResumeError("");
    setDeleteLoadingId(application.id);
    try {
      const response = await fetch(`/api/resumes/${application.resume_id}`, {
        method: "DELETE"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Failed to delete resume");
      }

      await loadPipeline();
      if (selectedResume?.id === application.resume_id) {
        setSelectedResume(null);
        setSelectedResumeApplications([]);
      }
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to delete resume");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pipeline Details</h1>
          <p className="page-subtitle">Review applicants and progress for this hiring pipeline.</p>
        </div>
        <div className="inlineActions wrap">
          <button 
            className={`btn ${data?.pipeline?.is_active ? 'btn-secondary' : 'btn-primary'}`} 
            onClick={() => handleToggleStatus()}
            disabled={savingPipeline || loading}
          >
            {savingPipeline ? "..." : (data?.pipeline?.is_active ? "Close Position" : "Open Position")}
          </button>
          <button className="btn btn-secondary" onClick={() => router.push("/hr")}>Back</button>
          <button className="btn btn-secondary" onClick={loadPipeline}>Refresh</button>
        </div>
      </div>

      {loading && (
        <div className="card">
          <p>Loading pipeline...</p>
        </div>
      )}

      {!loading && error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="card pipeline-detail-card">
            <div className="pipeline-header-actions">
              <h2 className="pipeline-detail-title">{data.pipeline.job_title}</h2>
              {!isEditing && (
                <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
                  Edit Pipeline
                </button>
              )}
            </div>
            <p className="page-subtitle">Created {new Date(data.pipeline.created_at).toLocaleDateString()}</p>

            {isEditing && (
              <div className="pipeline-edit-block">
                {editError && <div className="error-box">{editError}</div>}
                <div className="form-group">
                  <label htmlFor="editPipelineTitle">Pipeline Title</label>
                  <input
                    id="editPipelineTitle"
                    type="text"
                    value={editForm.job_title}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, job_title: e.target.value }))}
                    disabled={savingPipeline}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editPipelineJd">Job Description</label>
                  <textarea
                    id="editPipelineJd"
                    rows={6}
                    value={editForm.jd_text}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, jd_text: e.target.value }))}
                    disabled={savingPipeline}
                  />
                </div>
                <div className="row two">
                  <div className="form-group">
                    <label htmlFor="editPipelineTags">Tags (comma-separated)</label>
                    <input
                      id="editPipelineTags"
                      type="text"
                      value={editForm.tags}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, tags: e.target.value }))}
                      disabled={savingPipeline}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="editPipelineThreshold">Threshold</label>
                    <input
                      id="editPipelineThreshold"
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.threshold}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, threshold: Number(e.target.value) }))}
                      disabled={savingPipeline}
                    />
                  </div>
                </div>
                <div className="inlineActions">
                  <button className="btn btn-primary" onClick={handleSavePipeline} disabled={savingPipeline}>
                    {savingPipeline ? "Saving..." : "Save Changes"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setIsEditing(false)} disabled={savingPipeline}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="row three pipeline-detail-metrics">
              <div className="card">
                <h3 className="m0">Candidates</h3>
                <p className="metric-value">{data.stats.candidates}</p>
              </div>
              <div className="card">
                <h3 className="m0">Avg Score</h3>
                <p className="metric-value">{Math.round(data.stats.avg_score)}</p>
              </div>
              <div className="card">
                <h3 className="m0">Shortlisted</h3>
                <p className="metric-value">{data.stats.shortlisted}</p>
              </div>
            </div>

            <div className="pipeline-detail-meta">
              <p className="m0"><strong>Threshold:</strong> {data.pipeline.threshold}</p>
              {data.pipeline.tags?.length > 0 && (
                <div className="pipeline-tags pipeline-detail-tags">
                  {data.pipeline.tags.map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Bulk Resume Ingestion</h2>
            <p className="page-subtitle section-subtitle-spaced">
              Upload multiple PDF resumes to screen candidates in one batch using this pipeline's threshold.
            </p>

            {batchError && <div className="error-box">{batchError}</div>}
            {batchSummary && (
              <div className="success-box">
                Processed {batchSummary.created}/{batchSummary.total_received}. Shortlisted: {batchSummary.shortlisted}, Screened: {batchSummary.screened}
                {batchSummary.failed.length > 0 && `, Failed: ${batchSummary.failed.length}`}
              </div>
            )}

            {batchSummary && batchSummary.failed.length > 0 && (
              <div className="error-box">
                {batchSummary.failed.slice(0, 5).map((item) => (
                  <p key={`${item.index}-${item.file_name}`} className="m0">
                    #{item.index} ({item.file_name}): {item.reason}
                  </p>
                ))}
              </div>
            )}

            <label htmlFor="batchPdfUpload" className="form-label">Upload PDF resumes</label>
            <input
              id="batchPdfUpload"
              className="bulk-file-input"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              title="Upload one or more PDF resumes"
              onChange={(e) => setBulkFiles(Array.from(e.target.files || []))}
              disabled={batchLoading}
            />

            <p className="page-subtitle section-subtitle-spaced">
              {bulkFiles.length > 0 ? `${bulkFiles.length} PDF(s) selected` : "No files selected"}
            </p>

            <div className="inlineActions">
              <button className="btn btn-primary" onClick={handleBatchProcess} disabled={batchLoading}>
                {batchLoading ? "Processing PDFs..." : "Upload & Process PDFs"}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Candidate Notifications</h2>
            <p className="page-subtitle section-subtitle-spaced">
              Sends status updates to all applicants. Shortlisted candidates receive a secure video interview link.
            </p>

            <div className="row two">
              <div className="form-group">
                <label htmlFor="interviewQuestions">Video interview: Number of questions</label>
                <input
                  id="interviewQuestions"
                  type="number"
                  min="1"
                  max="30"
                  value={interviewQuestions}
                  onChange={(e) => setInterviewQuestions(Number(e.target.value || 8))}
                  disabled={notifyLoading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="interviewMinutes">Video interview: Time limit (minutes)</label>
                <input
                  id="interviewMinutes"
                  type="number"
                  min="5"
                  max="180"
                  value={interviewMinutes}
                  onChange={(e) => setInterviewMinutes(Number(e.target.value || 20))}
                  disabled={notifyLoading}
                />
              </div>
            </div>

            {notifyError && <div className="error-box">{notifyError}</div>}
            {notifySummary && (
              <div className={notifySummary.failures.length > 0 ? "error-box" : "success-box"}>
                Attempted: {notifySummary.attempted}, Sent: {notifySummary.notified}/{notifySummary.total_applications}, Interview links sent: {notifySummary.interview_links_sent}, Skipped: {notifySummary.skipped}
              </div>
            )}

            <div className="notification-preview-list">
              <h4 className="m0 mb10">Candidate Email Status</h4>
              <div className="notify-candidate-scroll">
                {(data.applications || []).map((app) => (
                  <div key={`notify-row-${app.id}`} className="notify-candidate-row">
                    <input
                      type="email"
                      className="notify-candidate-name inline-email-input"
                      value={inlineEmails[app.id] !== undefined ? inlineEmails[app.id] : (app.email.includes("Guest") ? "" : app.email)}
                      onChange={(e) => setInlineEmails((prev) => ({ ...prev, [app.id]: e.target.value }))}
                      placeholder="Enter email..."
                      title={`Email for candidate ${app.email}`}
                      disabled={notifyLoading}
                    />
                    <span className={`notify-candidate-source tag ${app.email_source === 'dashboard' ? 'tag-success' : app.email_source === 'resume' ? 'tag-primary' : 'tag-warning'}`}>
                      {app.email_source === 'dashboard' ? "Dashboard Account" : app.email_source === 'resume' ? "Found in Resume" : "Needs Manual Entry"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="manualEmails">Manual candidate emails</label>
              <textarea
                id="manualEmails"
                rows={4}
                value={manualEmails}
                onChange={(e) => setManualEmails(e.target.value)}
                placeholder="Paste one email per line or separate them with commas for uploaded resumes"
                disabled={notifyLoading}
              />
              <div className="notification-validation-help">
                <small>These emails are matched in order to applications that do not already have a valid email from their dashboard account or resume.</small>
                {data?.applications && (
                  <div className="email-status-badge">
                    {(() => {
                      const manualAppsCount = data.applications.filter(app => {
                        const hasValidInline = inlineEmails[app.id] && inlineEmails[app.id].trim().length > 3 && inlineEmails[app.id].includes("@");
                        return !hasValidInline && (app.email_source === "manual" || (app.email && app.email.includes("Guest")));
                      }).length;
                      const enteredEmails = manualEmails.split(/[\n,;]/).map(e => e.trim()).filter(e => e && e.includes("@")).length;
                      
                      if (manualAppsCount > 0) {
                        return (
                          <p className={`m0 mt5 ${enteredEmails < manualAppsCount ? 'text-warning' : 'text-success'}`}>
                            <strong>{manualAppsCount}</strong> candidate(s) need manual emails. 
                            <strong>{enteredEmails}</strong> provided via text area below.
                            {enteredEmails < manualAppsCount && " Please provide more emails or fill them above."}
                          </p>
                        );
                      }
                      return <p className="m0 mt5 text-success">All candidates have linked emails. No extra manual entry needed.</p>;
                    })()}
                  </div>
                )}
              </div>
            </div>

            {notifySummary && notifySummary.sent_to.length > 0 && (
              <div className="success-box">
                <p className="m0"><strong>Delivered to:</strong></p>
                {notifySummary.sent_to.slice(0, 8).map((item) => (
                  <p key={`${item.application_id}-${item.email}`} className="m0">
                    {item.email} · {item.status} · {item.source}{item.interview_link ? " · interview link sent" : ""}
                  </p>
                ))}
              </div>
            )}

            {notifySummary && notifySummary.failures.length > 0 && (
              <div className="error-box">
                {notifySummary.failures.slice(0, 5).map((item) => (
                  <p key={`${item.application_id}-${item.reason}`} className="m0">
                    {item.application_id.slice(0, 8)}...: {item.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="inlineActions">
              <button 
                className="btn btn-primary" 
                onClick={handleNotifyCandidates} 
                disabled={(() => {
                  if (notifyLoading) return true;
                  if (!data?.applications) return false;
                  
                  const manualAppsCount = data.applications.filter(app => {
                    const hasValidInline = inlineEmails[app.id] && inlineEmails[app.id].trim().length > 3 && inlineEmails[app.id].includes("@");
                    return !hasValidInline && (app.email_source === "manual" || (app.email && app.email.includes("Guest")));
                  }).length;
                  
                  const enteredEmails = manualEmails.split(/[\n,;]/).map(e => e.trim()).filter(e => e && e.includes("@")).length;
                  return manualAppsCount > 0 && enteredEmails < manualAppsCount;
                })()}
              >
                {notifyLoading ? "Sending Notifications..." : "Notify Candidates & Send Interview Links"}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Post Interview Finalization</h2>
            <p className="page-subtitle section-subtitle-spaced">
              After reports are generated, select final candidates manually or let AI select by interview score.
            </p>

            {finalizeError && <div className="error-box">{finalizeError}</div>}
            {finalizeSummary && (
              <div className={finalizeSummary.failures.length > 0 ? "error-box" : "success-box"}>
                Selected: {finalizeSummary.selected_count}, Pass emails sent: {finalizeSummary.emails_sent}, Skipped: {finalizeSummary.skipped}
              </div>
            )}

            <div className="row two">
              <div className="form-group">
                <label htmlFor="finalizeMode">Selection mode</label>
                <select
                  id="finalizeMode"
                  value={finalizeMode}
                  onChange={(e) => setFinalizeMode(e.target.value as "manual" | "ai")}
                  disabled={finalizeLoading}
                >
                  <option value="manual">Manual selection by HR</option>
                  <option value="ai">AI selection by interview score</option>
                </select>
              </div>

              {finalizeMode === "ai" && (
                <div className="form-group">
                  <label htmlFor="aiCutoff">AI score cutoff</label>
                  <input
                    id="aiCutoff"
                    type="number"
                    min="0"
                    max="100"
                    value={aiCutoffScore}
                    onChange={(e) => setAiCutoffScore(Number(e.target.value || 70))}
                    disabled={finalizeLoading}
                  />
                </div>
              )}
            </div>

            {finalizeMode === "manual" && (
              <div className="pipeline-table-wrap">
                <table className="pipeline-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Candidate</th>
                      <th>Interview Score</th>
                      <th>AI Recommendation</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.applications
                      .filter((app) => !!app.latest_interview_id)
                      .map((app) => (
                        <tr key={`finalize-${app.id}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!selectedForFinalRound[app.id]}
                              onChange={() => toggleSelectedCandidate(app.id)}
                              disabled={finalizeLoading}
                              title={`Select ${app.email} for final rounding`}
                            />
                          </td>
                          <td>{app.email}</td>
                          <td>{app.latest_interview_score ?? "-"}</td>
                          <td>{app.latest_interview_recommendation || "pending"}</td>
                          <td>
                            {app.latest_report_pdf_url ? (
                              <a href={app.latest_report_pdf_url} target="_blank" rel="noreferrer">Open Report</a>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="finalize-actions-row">
              <button 
                className="btn btn-primary" 
                onClick={() => handleFinalizeCandidates("pass")} 
                disabled={finalizeLoading}
              >
                {finalizeLoading ? "Finalizing..." : "Finalize & Send Pass Emails"}
              </button>
              <button 
                className="btn btn-secondary btn-reject" 
                onClick={() => handleFinalizeCandidates("reject")} 
                disabled={finalizeLoading}
              >
                {finalizeLoading ? "Finalizing..." : "Reject Selected & Send Rejection Emails"}
              </button>
            </div>
          </div>

          {resumeError && <div className="error-box">{resumeError}</div>}

          <div className="card">
            <h2>Applications</h2>
            {data.applications.length === 0 && (
              <div className="empty-state pipeline-detail-empty">
                <h3>No applications yet</h3>
                <p>Applications will appear here when candidates apply or when you ingest resumes in batch.</p>
              </div>
            )}

            {data.applications.length > 0 && (
              <div className="pipeline-table-wrap">
                <table className="pipeline-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Email Source</th>
                      <th>Status</th>
                      <th>Match Score</th>
                      <th>Interview Score</th>
                      <th>Applied</th>
                      <th>Actions</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.applications.map((app) => (
                      <tr key={app.id}>
                        <td>{app.email}</td>
                        <td>{app.email_source || (app.candidate_id ? "dashboard" : "manual")}</td>
                        <td className="pipeline-status-cell">{app.status}</td>
                        <td>{app.score ?? "-"}</td>
                        <td className={`pipeline-score-cell ${app.latest_interview_score !== null && app.latest_interview_score !== undefined ? (app.latest_interview_score >= 70 ? "text-success" : "text-warning") : "text-muted"}`}>
                          {app.latest_interview_score !== null 
                            ? app.latest_interview_score 
                            : (app.status === "rejected" || (app.score !== null && app.score < (data?.pipeline?.threshold || 0)) 
                                ? "NA" 
                                : "-")}
                        </td>
                        <td>{new Date(app.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="inlineActions wrap">
                            {app.latest_interview_id && app.status !== "rejected" && app.latest_interview_score !== null && (app.score ?? 0) >= (data?.pipeline?.threshold || 0) && (
                              <button
                                className="btn btn-primary btn-xs"
                                onClick={() => handleViewEvaluation(app)}
                                disabled={evaluationLoadingId === app.id}
                              >
                                {evaluationLoadingId === app.id ? "..." : "AI Eval"}
                              </button>
                            )}
                             <button
                               className="btn btn-secondary btn-xs"
                               onClick={() => handleViewResume(app)}
                               disabled={resumeLoadingId === app.id || deleteLoadingId === app.id}
                             >
                               {resumeLoadingId === app.id ? "..." : "View CV"}
                             </button>
                             <button
                               className="btn btn-secondary btn-xs btn-delete-cv"
                               onClick={() => handleDeleteResume(app)}
                               disabled={deleteLoadingId === app.id || resumeLoadingId === app.id}
                             >
                               {deleteLoadingId === app.id ? "..." : "Delete CV"}
                             </button>
                          </div>
                        </td>
                        <td className="pipeline-id-cell">{app.id.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedResume && (
            <div className="resume-modal-backdrop" onClick={() => setSelectedResume(null)}>
              <div 
                className="card resume-modal resume-modal-size" 
                onClick={(event) => event.stopPropagation()}
              >
                <div className="pipeline-header-actions">
                  <div>
                    <h2 className="pipeline-detail-title m0">{selectedResume.file_name || "Resume Preview"}</h2>
                    <p className="page-subtitle m0">Uploaded {new Date(selectedResume.created_at).toLocaleDateString()}</p>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setSelectedResume(null)}>
                    Close
                  </button>
                </div>

                <div className="resume-modal-content">
                  <div className="resume-modal-meta">
                    <p className="m0"><strong>Type:</strong> {selectedResume.file_type || "Text/Extract"}</p>
                    <p className="m0"><strong>Size:</strong> {selectedResume.file_size ? `${Math.round(selectedResume.file_size / 1024)} KB` : "N/A"}</p>
                    <p className="m0"><strong>Usage:</strong> {selectedResumeApplications.length} apps</p>
                  </div>

                  {selectedResume.view_url ? (
                    <div className="resume-pdf-container">
                      <iframe 
                        src={`${selectedResume.view_url}#toolbar=0`}
                        width="100%" 
                        height="100%" 
                        className="resume-iframe"
                        title="Resume PDF"
                      />
                    </div>
                  ) : (
                    <div className="resume-no-pdf-fallback">                      border: "2px dashed var(--line)", 
                      borderRadius: "12px", 
                      textAlign: "center",
                      background: "#fcfcfc",
                      color: "var(--text-muted)"
                    }}>
                      <div style={{ fontSize: "32px", marginBottom: "12px" }}>📄</div>
                      <h3 className="m0" style={{ color: "var(--text)" }}>Original PDF not available</h3>
                      <p className="m0" style={{ marginTop: "8px" }}>Only the text version was recorded for this application.</p>
                    </div>
                  )}

                  <div className="resume-preview-panel">
                    <h3 className="m0" style={{ marginBottom: "12px" }}>Extracted Resume Text</h3>
                    <div style={{ 
                      padding: "16px", 
                      background: "var(--light-bg)", 
                      borderRadius: "8px", 
                      fontSize: "14px", 
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                      maxHeight: "300px",
                      overflowY: "auto",
                      border: "1px solid var(--line)"
                    }}>
                      {selectedResume.parsed_content || selectedResume.content || "No text preview available."}
                    </div>
                  </div>

                  {selectedResumeApplications.length > 0 && (
                    <div className="resume-linked-apps" style={{ marginTop: "32px" }}>
                      <h3 className="m0" style={{ marginBottom: "16px" }}>Linked Applications</h3>
                      {selectedResumeApplications.map((application) => (
                        <div key={application.id} className="resume-linked-app-row" style={{ padding: "12px", border: "1px solid var(--line)", borderRadius: "8px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong>{application.pipeline_title}</strong>
                            <p className="m0" style={{ fontSize: "13px", color: "var(--text-muted)" }}>{application.status} · Score {application.score ?? "-"}</p>
                          </div>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{new Date(application.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedEvaluation && (
            <div className="resume-modal-backdrop" onClick={() => setSelectedEvaluation(null)}>
              <div 
                className="card resume-modal evaluation-modal-size" 
                onClick={(event) => event.stopPropagation()}
              >
                <div className="evaluation-header">
                  <div>
                    <h2 className="pipeline-detail-title m0">AI Evaluation Report</h2>
                    <p className="page-subtitle m0">Overall Score: {selectedEvaluation.overallScore}/100</p>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setSelectedEvaluation(null)}>
                    Close
                  </button>
                </div>

                <div className="evaluation-body">
                  <div className="eval-card">
                    <h3 className="m0 mb10">Executive Summary</h3>
                    <p className="eval-summary-text">{selectedEvaluation.summary || "No summary available."}</p>
                  </div>
                  
                  <div className="eval-split-row">
                    <div className="eval-card eval-strength-card">
                      <h3 className="m0 mb10 text-success">Key Strengths</h3>
                      <ul className="eval-list">
                        {selectedEvaluation.strengths?.length > 0 ? selectedEvaluation.strengths.map((str, i) => <li key={i} className="mb5">{str}</li>) : <li>None noted.</li>}
                      </ul>
                    </div>
                    <div className="eval-card eval-weakness-card">
                      <h3 className="m0 mb10 text-warning">Areas for Improvement</h3>
                      <ul className="eval-list">
                        {selectedEvaluation.weaknesses?.length > 0 ? selectedEvaluation.weaknesses.map((weak, i) => <li key={i} className="mb5">{weak}</li>) : <li>None noted.</li>}
                      </ul>
                    </div>
                  </div>

                  <div className="eval-card">
                    <h3 className="m0 mb20">KPI Breakdown</h3>
                    <div className="eval-kpi-grid">
                      {Object.entries(selectedEvaluation.kpis || {}).map(([key, data]) => (
                        <div key={key} className="eval-kpi-item">
                          <div className="kpi-header">
                            <strong className="kpi-name">{key.replace("_", " ")}</strong>
                            <span className="kpi-score">{data.score}/100</span>
                          </div>
                          <p className="kpi-feedback">{data.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {selectedEvaluation.transcript?.length > 0 && (
                    <div className="eval-card">
                      <h3 className="m0 mb20">Interview Transcript</h3>
                      <div className="eval-transcript-container">
                        {selectedEvaluation.transcript.map((msg, idx) => (
                          <div key={idx} className={`transcript-entry role-${msg.role}`}>
                            <div className="transcript-role">
                                {msg.role === "candidate" ? "Candidate" : "AI Interviewer"}
                            </div>
                            <div className="transcript-text">{msg.text}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
