"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";

export type InterviewInfo = {
  state: "ready" | "in_progress" | "completed" | "expired" | "closed";
  interview_id: string;
  expires_at: string | null;
  pipeline_title: string;
  max_questions: number;
  duration_minutes: number;
};

const CLOSED_MESSAGES: Record<string, { title: string; body: string }> = {
  completed: {
    title: "Interview complete",
    body: "Thank you. Your interview has been recorded and the hiring team will review it. You can close this page."
  },
  expired: {
    title: "This link has expired",
    body: "Interview links are valid for 72 hours. Please contact the hiring team to request a new one."
  },
  closed: {
    title: "This interview is no longer active",
    body: "Your application status has changed. Please contact the hiring team if you have questions."
  }
};

/** The screen for any link that can no longer start an interview, or for an invalid link. */
export function InterviewNotice({ state, error }: { state?: InterviewInfo["state"]; error?: string }) {
  const notice = state ? CLOSED_MESSAGES[state] : undefined;
  const isDone = state === "completed";
  return (
    <div className="focus-page page-enter">
      <div className="card focus-card center">
        <div className={`status-icon ${isDone ? "status-icon-ok" : "status-icon-bad"}`}>
          {isDone ? <CheckCircle2 size={26} aria-hidden="true" /> : <CircleAlert size={26} aria-hidden="true" />}
        </div>
        <h1>{notice?.title || "We couldn't open this interview"}</h1>
        <p className="page-subtitle">{notice?.body || error || "This interview link is not valid."}</p>
      </div>
    </div>
  );
}
