"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, LoadingState, fetchJson } from "@/shared/components/ui";
import { InterviewNotice, type InterviewInfo } from "@/shared/components/InterviewStates";

const MIN_CHARS = 10;

/** The written alternative to the video interview. It is labelled as written in HR's evaluation. */
export default function WrittenInterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  const token = searchParams.get("token") || "";

  const [info, setInfo] = useState<InterviewInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    fetchJson<InterviewInfo>(`/api/interviews/${interviewId}/public${query}`)
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load this interview."))
      .finally(() => setLoading(false));
  }, [interviewId, token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await fetchJson(`/api/interviews/${interviewId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_token: token, transcript: response })
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit your interview.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading interview..." />;
  if (submitted) return <InterviewNotice state="completed" />;
  if (loadError || !info) return <InterviewNotice error={loadError} />;
  if (info.state === "completed" || info.state === "expired" || info.state === "closed") {
    return <InterviewNotice state={info.state} />;
  }

  const length = response.trim().length;

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card focus-card-wide">
        <h1>Written interview</h1>
        <p className="form-subtitle">{info.pipeline_title}</p>

        <Alert kind="info">
          Use this if you can&apos;t take the video interview. You can submit only once, and your interview is complete when you do.
        </Alert>
        {submitError && <Alert>{submitError}</Alert>}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="response">Your response</label>
            <textarea
              id="response"
              rows={12}
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder="Describe your most relevant experience for this role: what you built, the decisions you made, and the results."
              disabled={submitting}
              required
            />
            <small>{length < MIN_CHARS ? `At least ${MIN_CHARS} characters` : `${length} characters`}</small>
          </div>
          <div className="actions">
            <button type="submit" className="btn" disabled={submitting || length < MIN_CHARS}>
              {submitting ? "Submitting and evaluating..." : "Submit interview"}
            </button>
            <Link className="btn btn-secondary" href={`/video-interview/${interviewId}?token=${encodeURIComponent(token)}` as never}>
              Back to video interview
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
