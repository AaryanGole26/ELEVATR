"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, FileUp } from "lucide-react";
import { AuthGuard } from "@/shared/components/AuthGuard";
import { Alert, LoadingState, fetchJson } from "@/shared/components/ui";
import { useAuth } from "@/shared/auth-context";

const MAX_BYTES = 5 * 1024 * 1024;

type Opportunity = { id: string; title: string; jd_text: string; tags: string[] | null; is_active: boolean; applied: boolean };

export default function ApplyPage() {
  return (
    <AuthGuard requiredRole="candidate">
      <ApplyContent />
    </AuthGuard>
  );
}

function ApplyContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const pipelineId = params.pipeline_id as string;

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string } | null>(null);

  useEffect(() => {
    fetchJson<{ opportunity: Opportunity }>(`/api/opportunities/${pipelineId}`)
      .then((data) => setOpportunity(data.opportunity))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load this position."))
      .finally(() => setLoading(false));
  }, [pipelineId]);

  const selectFile = (selected: File | null) => {
    setFormError("");
    if (selected && selected.size > MAX_BYTES) {
      setFile(null);
      setFormError("That file is larger than 5MB. Please choose a smaller PDF.");
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setFormError("");
    try {
      const body = new FormData();
      body.append("pipeline_id", pipelineId);
      body.append("resume", file);
      const data = await fetchJson<{ status: string }>("/api/applications", { method: "POST", body });
      setResult(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to submit your application.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading position..." />;

  if (loadError || !opportunity) {
    return (
      <div className="focus-page page-enter">
        <div className="card focus-card center">
          <h1>Can&apos;t open this position</h1>
          <p className="form-subtitle">{loadError || "This position is unavailable."}</p>
          <Link className="btn" href="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="focus-page page-enter">
        <div className="card focus-card center">
          <div className="status-icon status-icon-ok"><CheckCircle2 size={26} aria-hidden="true" /></div>
          <h1>Application submitted</h1>
          <p className="form-subtitle">
            Your resume for {opportunity.title} has been received and screened. You can follow its progress on your dashboard, and we&apos;ll email you about next steps.
          </p>
          <button type="button" className="btn" onClick={() => router.push("/dashboard")}>Go to dashboard</button>
        </div>
      </div>
    );
  }

  const unavailable = opportunity.applied
    ? "You've already applied to this position."
    : !opportunity.is_active
      ? "This position is no longer accepting applications."
      : "";

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card focus-card-wide">
        <h1>{opportunity.title}</h1>
        {!!opportunity.tags?.length && (
          <div className="tags mb">{opportunity.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>
        )}

        <h3>Job description</h3>
        <div className="scroll-panel mb">{opportunity.jd_text}</div>

        {unavailable ? (
          <>
            <Alert kind="info">{unavailable}</Alert>
            <Link className="btn btn-secondary" href="/dashboard">Back to dashboard</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            {formError && <Alert>{formError}</Alert>}
            <p className="muted" style={{ margin: 0 }}>Applying as <strong>{user?.email}</strong></p>

            <div className="form-group">
              <span className="form-label">Your resume</span>
              <label className="file-drop">
                <input type="file" accept="application/pdf,.pdf" aria-label="Upload your resume as a PDF" onChange={(e) => selectFile(e.target.files?.[0] || null)} disabled={submitting} />
                <FileUp size={26} aria-hidden="true" />
                {file ? (
                  <span><strong>{file.name}</strong><br /><small>{(file.size / 1024).toFixed(0)} KB · choose another file to replace it</small></span>
                ) : (
                  <span><strong>Choose a PDF</strong><br /><small>Text-based PDF, up to 5MB</small></span>
                )}
              </label>
            </div>

            <div className="actions">
              <button type="submit" className="btn" disabled={submitting || !file}>
                {submitting ? "Submitting..." : "Submit application"}
              </button>
              <Link className="btn btn-secondary" href="/dashboard">Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
