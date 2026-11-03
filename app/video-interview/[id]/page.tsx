"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Camera, Clock, ListChecks, Video } from "lucide-react";
import { Alert, LoadingState, fetchJson } from "@/shared/components/ui";
import { InterviewNotice, type InterviewInfo } from "@/shared/components/InterviewStates";

const POLL_MS = 5000;

export default function VideoInterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  const token = searchParams.get("token") || "";

  const [info, setInfo] = useState<InterviewInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const data = await fetchJson<InterviewInfo>(`/api/interviews/${interviewId}/public${query}`);
    setInfo(data);
    return data;
  }, [interviewId, token]);

  useEffect(() => {
    load()
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load this interview."))
      .finally(() => setLoading(false));
  }, [load]);

  // While the interview runs in its own tab, this page waits for the result.
  useEffect(() => {
    if (!launched) return;
    pollRef.current = window.setInterval(() => {
      load().catch(() => undefined);
    }, POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [launched, load]);

  const startInterview = async () => {
    setLaunchError("");
    setLaunching(true);
    // Opened before the request: browsers block pop-ups opened after an await.
    const tab = window.open("about:blank", "_blank");
    try {
      const data = await fetchJson<{ launch_url: string }>(`/api/interviews/${interviewId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (tab) {
        tab.opener = null;
        tab.location.href = data.launch_url;
        setLaunched(true);
      } else {
        window.location.href = data.launch_url;
      }
    } catch (err) {
      tab?.close();
      setLaunchError(err instanceof Error ? err.message : "Could not start the interview.");
    } finally {
      setLaunching(false);
    }
  };

  if (loading) return <LoadingState label="Preparing your interview..." />;
  if (loadError || !info) return <InterviewNotice error={loadError} />;
  if (info.state === "completed" || info.state === "expired" || info.state === "closed") {
    return <InterviewNotice state={info.state} />;
  }

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card focus-card-wide">
        <div className="status-icon status-icon-info"><Video size={24} aria-hidden="true" /></div>
        <h1 className="center">Your AI video interview</h1>
        <p className="form-subtitle center">{info.pipeline_title}</p>

        {launchError && <Alert>{launchError}</Alert>}
        {launched && (
          <Alert kind="info">Your interview is open in a new tab. This page will update when you finish.</Alert>
        )}
        {info.state === "in_progress" && !launched && (
          <Alert kind="info">You&apos;ve already started this interview. You can reopen it below to continue.</Alert>
        )}

        <div className="list mb">
          <div className="module-row">
            <span className="icon-tile"><ListChecks size={18} aria-hidden="true" /></span>
            <div><strong>Up to {info.max_questions} questions</strong><span>Tailored to your resume and the job description.</span></div>
          </div>
          <div className="module-row">
            <span className="icon-tile"><Clock size={18} aria-hidden="true" /></span>
            <div>
              <strong>About {info.duration_minutes} minutes</strong>
              <span>{info.expires_at ? `This link expires on ${new Date(info.expires_at).toLocaleString()}.` : "Complete it in one sitting."}</span>
            </div>
          </div>
          <div className="module-row">
            <span className="icon-tile"><Camera size={18} aria-hidden="true" /></span>
            <div><strong>Camera, microphone and fullscreen</strong><span>The session is proctored. Leaving fullscreen or switching tabs counts as a warning, and three warnings end the interview.</span></div>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn" onClick={startInterview} disabled={launching}>
            {launching ? "Starting..." : info.state === "in_progress" || launched ? "Reopen interview" : "Start interview"}
          </button>
          <Link className="btn btn-secondary" href={`/interview/${interviewId}?token=${encodeURIComponent(token)}` as never}>
            Answer in writing instead
          </Link>
        </div>
      </div>
    </div>
  );
}
