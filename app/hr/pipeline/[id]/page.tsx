"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileUp, Mail, Pencil, RefreshCw, Users } from "lucide-react";
import { AuthGuard } from "@/shared/components/AuthGuard";
import { EvaluationModal } from "@/shared/components/EvaluationModal";
import { Alert, ConfirmDialog, EmptyState, LoadingState, Metric, Modal, StatusBadge, fetchJson, useToast } from "@/shared/components/ui";

type Pipeline = {
  id: string;
  job_title: string;
  jd_text: string;
  threshold: number;
  tags: string[] | null;
  created_at: string;
  is_active: boolean;
};

type Application = {
  id: string;
  resume_id: string;
  email: string;
  email_source: string;
  status: string;
  score: number | null;
  created_at: string;
  last_notified_status: string | null;
  latest_interview_id: string | null;
  latest_interview_score: number | null;
  latest_interview_recommendation: "selected" | "pending" | null;
  latest_report_pdf_url: string | null;
  interview_completed: boolean;
};

type PipelineData = {
  pipeline: Pipeline;
  applications: Application[];
  stats: { candidates: number; avg_score: number; shortlisted: number };
};

type ResumeDetails = {
  id: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  content: string | null;
  parsed_content: string | null;
  view_url: string | null;
};

type BatchSummary = {
  total_received: number;
  created: number;
  shortlisted: number;
  screened: number;
  failed: Array<{ index: number; file_name: string; reason: string }>;
};

type NotifySummary = {
  attempted: number;
  notified: number;
  interview_links_sent: number;
  already_notified: number;
  unsent_no_email_service: number;
  missing_email: string[];
  sent_to: Array<{ application_id: string; email: string; status: string; interview_link?: string; email_sent: boolean }>;
  failures: Array<{ application_id: string; reason: string }>;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function HRPipelineDetailPage() {
  return (
    <AuthGuard requiredRole="hr">
      <PipelineDetailContent />
    </AuthGuard>
  );
}

function PipelineDetailContent() {
  const params = useParams();
  const pipelineId = params.id as string;
  const toast = useToast();

  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeDetails | null>(null);
  const [resumeLoadingId, setResumeLoadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await fetchJson<PipelineData>(`/api/pipelines/${pipelineId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this pipeline.");
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleOpen = async () => {
    if (!data) return;
    const { pipeline } = data;
    try {
      await fetchJson(`/api/pipelines/${pipelineId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          job_title: pipeline.job_title,
          jd_text: pipeline.jd_text,
          tags: pipeline.tags || [],
          threshold: pipeline.threshold,
          is_active: !pipeline.is_active
        })
      });
      toast("success", pipeline.is_active ? "Position closed to new applicants." : "Position reopened.");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not update the position.");
    }
  };

  const viewResume = async (application: Application) => {
    setResumeLoadingId(application.id);
    try {
      const details = await fetchJson<{ resume: ResumeDetails }>(`/api/resumes/${application.resume_id}`);
      setResume(details.resume);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not load this resume.");
    } finally {
      setResumeLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/resumes/${deleteTarget.resume_id}`, { method: "DELETE" });
      toast("success", "Resume and linked application deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not delete this resume.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingState label="Loading pipeline..." />;
  if (!data) {
    return (
      <div className="focus-page">
        <div className="card focus-card center">
          <h1>Can&apos;t open this pipeline</h1>
          <p className="form-subtitle">{error || "This pipeline is unavailable."}</p>
          <Link className="btn" href="/hr">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const { pipeline, applications, stats } = data;

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <Link href="/hr" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.85rem" }}>
            <ArrowLeft size={14} aria-hidden="true" /> HR dashboard
          </Link>
          <h1 style={{ marginTop: 6 }}>{pipeline.job_title}</h1>
          <div className="actions">
            <span className={`badge ${pipeline.is_active ? "badge-ok" : ""}`}>{pipeline.is_active ? "Open" : "Closed"}</span>
            <span className="muted">Minimum match {pipeline.threshold} · Created {new Date(pipeline.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={load}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true" /> Edit</button>
          <button type="button" className="btn btn-secondary" onClick={toggleOpen}>{pipeline.is_active ? "Close position" : "Reopen position"}</button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-4">
        <Metric label="Candidates" value={stats.candidates} />
        <Metric label="Average match" value={Math.round(stats.avg_score)} />
        <Metric label="Shortlisted" value={stats.shortlisted} />
      </div>

      <section className="card section">
        <div className="section-title"><h2>Candidates</h2></div>
        {applications.length === 0 ? (
          <EmptyState icon={<Users size={28} aria-hidden="true" />} title="No candidates yet">
            <p>Candidates appear here when they apply or when you upload resumes below.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Candidate</th><th>Status</th><th>Match</th><th>Interview</th><th>Applied</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id}>
                    <td>{app.email || <span className="muted">No email yet</span>}</td>
                    <td><StatusBadge status={app.status} /></td>
                    <td>{app.score ?? "–"}</td>
                    <td>{app.latest_interview_score ?? (app.interview_completed ? "Pending evaluation" : "–")}</td>
                    <td className="nowrap">{new Date(app.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="actions" style={{ flexWrap: "nowrap" }}>
                        {app.latest_interview_id && app.interview_completed && (
                          <button type="button" className="btn btn-sm" onClick={() => setEvaluationId(app.latest_interview_id)}>AI Eval</button>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => viewResume(app)} disabled={resumeLoadingId === app.id}>
                          {resumeLoadingId === app.id ? "Opening..." : "View CV"}
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(app)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-sidebar section">
        <NotifyCard pipelineId={pipelineId} applications={applications} onDone={load} />
        <div className="stack">
          <BatchUploadCard pipelineId={pipelineId} onDone={load} />
          <FinalizeCard pipelineId={pipelineId} applications={applications} onDone={load} />
        </div>
      </div>

      {editing && <EditPipelineModal pipeline={pipeline} onClose={() => setEditing(false)} onSaved={load} />}
      {evaluationId && <EvaluationModal interviewId={evaluationId} onClose={() => setEvaluationId(null)} onChanged={load} />}

      {resume && (
        <Modal
          title={resume.file_name || "Resume"}
          subtitle={`Uploaded ${new Date(resume.created_at).toLocaleDateString()}${resume.file_size ? ` · ${Math.round(resume.file_size / 1024)} KB` : ""}`}
          onClose={() => setResume(null)}
          large
        >
          <div className="stack">
            {resume.view_url
              ? <iframe className="resume-frame" src={`${resume.view_url}#toolbar=0`} title="Resume PDF" />
              : <Alert kind="info">Only the text of this resume was saved. The original file isn&apos;t available.</Alert>}
            <section>
              <h3>Extracted text</h3>
              <div className="scroll-panel">{resume.parsed_content || resume.content || "No text available."}</div>
            </section>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this resume?"
          confirmLabel="Delete resume"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        >
          <p>This permanently removes the resume for {deleteTarget.email || "this candidate"}, along with the linked application, interviews and analyses.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function NotifyCard({ pipelineId, applications, onDone }: { pipelineId: string; applications: Application[]; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [questions, setQuestions] = useState(8);
  const [minutes, setMinutes] = useState(20);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<NotifySummary | null>(null);

  const needEmail = useMemo(() => applications.filter((app) => !app.email), [applications]);

  const notify = async () => {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const result = await fetchJson<NotifySummary>(`/api/pipelines/${pipelineId}/notify`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ inline_emails: emails, interview_questions: questions, interview_minutes: minutes, resend })
      });
      setSummary(result);
      toast("success", `Processed ${result.attempted} candidate${result.attempted === 1 ? "" : "s"}.`);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to notify candidates.");
    } finally {
      setBusy(false);
    }
  };

  const unsentLinks = summary?.sent_to.filter((item) => !item.email_sent && item.interview_link) || [];

  return (
    <section className="card">
      <h2><Mail size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} /> Notify candidates</h2>
      <p className="page-subtitle mb">
        Shortlisted candidates get a secure interview link. Everyone else gets a status update. Candidates already told about their current status are skipped.
      </p>

      {error && <Alert>{error}</Alert>}

      <div className="form">
        <div className="grid grid-2">
          <div className="form-group">
            <label htmlFor="interviewQuestions">Interview questions</label>
            <input id="interviewQuestions" type="number" min={1} max={30} value={questions} onChange={(e) => setQuestions(Number(e.target.value))} disabled={busy} />
          </div>
          <div className="form-group">
            <label htmlFor="interviewMinutes">Time limit (minutes)</label>
            <input id="interviewMinutes" type="number" min={5} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={busy} />
          </div>
        </div>

        {needEmail.length > 0 && (
          <div className="form-group">
            <span className="form-label">Add missing emails ({needEmail.length})</span>
            <small>These resumes had no email address, so these candidates are skipped until you add one.</small>
            {needEmail.map((app) => (
              <input
                key={app.id}
                type="email"
                aria-label={`Email for candidate ${app.id.slice(0, 8)}`}
                placeholder={`Candidate ${app.id.slice(0, 8)} email`}
                value={emails[app.id] || ""}
                onChange={(e) => setEmails((current) => ({ ...current, [app.id]: e.target.value }))}
                disabled={busy}
              />
            ))}
          </div>
        )}

        <label className="actions" style={{ flexWrap: "nowrap", fontSize: "0.875rem", cursor: "pointer" }}>
          <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} disabled={busy} />
          Also resend to candidates who were already notified
        </label>

        <button type="button" className="btn" onClick={notify} disabled={busy || applications.length === 0}>
          {busy ? "Sending..." : "Notify candidates"}
        </button>
      </div>

      {summary && (
        <div className="mt">
          <Alert kind={summary.failures.length || summary.missing_email.length || summary.unsent_no_email_service ? "warning" : "success"}>
            Emails sent: {summary.notified}. Interview links sent: {summary.interview_links_sent}. Already notified: {summary.already_notified}.
            {summary.missing_email.length > 0 && ` Missing an email: ${summary.missing_email.length}.`}
            {summary.failures.length > 0 && ` Failed: ${summary.failures.length}.`}
          </Alert>
          {summary.unsent_no_email_service > 0 && (
            <Alert kind="warning">Email isn&apos;t configured on this server, so nothing was delivered. {unsentLinks.length > 0 && "Share these interview links directly:"}</Alert>
          )}
          {unsentLinks.length > 0 && (
            <div className="scroll-panel" data-testid="unsent-links">
              {unsentLinks.map((item) => `${item.email}\n${item.interview_link}`).join("\n\n")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BatchUploadCard({ pipelineId, onDone }: { pipelineId: string; onDone: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  const upload = async () => {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      setSummary(await fetchJson<BatchSummary>(`/api/pipelines/${pipelineId}/batch`, { method: "POST", body }));
      setFiles([]);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process these resumes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Upload resumes</h2>
      <p className="page-subtitle mb">Screen a batch of PDF resumes against this pipeline&apos;s job description.</p>

      {error && <Alert>{error}</Alert>}
      {summary && (
        <Alert kind={summary.failed.length ? "warning" : "success"}>
          Processed {summary.created} of {summary.total_received}: {summary.shortlisted} shortlisted, {summary.screened} below the minimum.
          {summary.failed.slice(0, 5).map((item) => <div key={item.index}>{item.file_name}: {item.reason}</div>)}
        </Alert>
      )}

      <div className="form">
        <label className="file-drop">
          <input type="file" accept="application/pdf,.pdf" multiple aria-label="Upload PDF resumes" onChange={(e) => setFiles(Array.from(e.target.files || []))} disabled={busy} />
          <FileUp size={24} aria-hidden="true" />
          <span>{files.length ? <strong>{files.length} PDF{files.length === 1 ? "" : "s"} selected</strong> : <><strong>Choose PDF resumes</strong><br /><small>Up to 100 files, 5MB each</small></>}</span>
        </label>
        <button type="button" className="btn btn-secondary" onClick={upload} disabled={busy || files.length === 0}>
          {busy ? "Processing..." : "Upload and screen"}
        </button>
      </div>
    </section>
  );
}

function FinalizeCard({ pipelineId, applications, onDone }: { pipelineId: string; applications: Application[]; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [cutoff, setCutoff] = useState(70);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"pass" | "reject" | null>(null);

  const interviewed = applications.filter((app) => app.interview_completed);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const finalize = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson<{ selected_count: number; emails_sent: number }>(`/api/pipelines/${pipelineId}/finalize`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ mode, selected_application_ids: selectedIds, ai_cutoff_score: cutoff, action: pendingAction })
      });
      toast("success", `${result.selected_count} candidate${result.selected_count === 1 ? "" : "s"} updated, ${result.emails_sent} email${result.emails_sent === 1 ? "" : "s"} sent.`);
      setSelected({});
      setPendingAction(null);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize candidates.");
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  };

  const describeAction = () => {
    const verb = pendingAction === "pass" ? "select" : "reject";
    if (mode === "manual") return `This will ${verb} ${selectedIds.length} candidate${selectedIds.length === 1 ? "" : "s"} and email them the decision.`;
    return pendingAction === "pass"
      ? `This will select every interviewed candidate scoring ${cutoff} or above and email them the decision.`
      : `This will reject every interviewed candidate scoring below ${cutoff} and email them the decision.`;
  };

  const canAct = mode === "ai" ? interviewed.length > 0 : selectedIds.length > 0;

  return (
    <section className="card">
      <h2>Final decisions</h2>
      <p className="page-subtitle mb">Choose candidates yourself, or use their interview scores.</p>

      {error && <Alert>{error}</Alert>}

      <div className="form">
        <div className="grid grid-2">
          <div className="form-group">
            <label htmlFor="finalizeMode">Selection method</label>
            <select id="finalizeMode" value={mode} onChange={(e) => setMode(e.target.value as "manual" | "ai")} disabled={busy}>
              <option value="manual">Choose candidates</option>
              <option value="ai">By interview score</option>
            </select>
          </div>
          {mode === "ai" && (
            <div className="form-group">
              <label htmlFor="aiCutoff">Score cutoff</label>
              <input id="aiCutoff" type="number" min={0} max={100} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} disabled={busy} />
            </div>
          )}
        </div>

        {interviewed.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No candidates have completed an interview yet.</p>
        ) : mode === "manual" && (
          <div className="list">
            {interviewed.map((app) => (
              <label key={app.id} className="list-item" style={{ cursor: "pointer", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!selected[app.id]}
                  onChange={() => setSelected((current) => ({ ...current, [app.id]: !current[app.id] }))}
                  disabled={busy}
                  aria-label={`Select ${app.email}`}
                />
                <span className="list-main">
                  <strong>{app.email}</strong>
                  <br />
                  <small>Interview score {app.latest_interview_score ?? "pending"}</small>
                </span>
                <StatusBadge status={app.status} />
                {app.latest_report_pdf_url && (
                  <a href={app.latest_report_pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Report</a>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={() => setPendingAction("pass")} disabled={busy || !canAct}>Select candidates</button>
          <button type="button" className="btn btn-danger" onClick={() => setPendingAction("reject")} disabled={busy || !canAct}>Reject candidates</button>
        </div>
      </div>

      {pendingAction && (
        <ConfirmDialog
          title={pendingAction === "pass" ? "Select these candidates?" : "Reject these candidates?"}
          confirmLabel={pendingAction === "pass" ? "Select and notify" : "Reject and notify"}
          danger={pendingAction === "reject"}
          busy={busy}
          onConfirm={finalize}
          onCancel={() => setPendingAction(null)}
        >
          <p>{describeAction()}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function EditPipelineModal({ pipeline, onClose, onSaved }: { pipeline: Pipeline; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({
    job_title: pipeline.job_title,
    jd_text: pipeline.jd_text,
    tags: (pipeline.tags || []).join(", "),
    threshold: pipeline.threshold
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await fetchJson(`/api/pipelines/${pipeline.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          job_title: form.job_title.trim(),
          jd_text: form.jd_text.trim(),
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          threshold: form.threshold
        })
      });
      toast("success", "Pipeline updated.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the pipeline.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit pipeline" onClose={() => !saving && onClose()}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={save} className="form">
        <div className="form-group">
          <label htmlFor="editTitle">Job title</label>
          <input id="editTitle" type="text" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} disabled={saving} required minLength={3} maxLength={100} />
        </div>
        <div className="form-group">
          <label htmlFor="editJd">Job description</label>
          <textarea id="editJd" rows={7} value={form.jd_text} onChange={(e) => setForm({ ...form, jd_text: e.target.value })} disabled={saving} required minLength={20} />
        </div>
        <div className="grid grid-2">
          <div className="form-group">
            <label htmlFor="editTags">Tags (comma-separated)</label>
            <input id="editTags" type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} disabled={saving} />
          </div>
          <div className="form-group">
            <label htmlFor="editThreshold">Minimum match score</label>
            <input id="editThreshold" type="number" min={0} max={100} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} disabled={saving} required />
          </div>
        </div>
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
