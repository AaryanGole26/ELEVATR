"use client";

import Link from "next/link";
import { Briefcase, FileSearch, Sparkles, Video } from "lucide-react";
import { useAuth } from "@/shared/auth-context";
import { LoadingState } from "@/shared/components/ui";

const MODULES = [
  { Icon: Briefcase, title: "HR pipelines", description: "Turn a job description into a screened, trackable hiring flow." },
  { Icon: FileSearch, title: "Resume analysis and builder", description: "Score resumes, close skill gaps, and export polished CVs." },
  { Icon: Video, title: "AI video interviews", description: "Secure, proctored interviews with AI evaluation and reports." }
];

const STEPS = [
  { number: "01", title: "Start with a role", description: "HR publishes a pipeline from a job description. Candidates apply with a PDF resume." },
  { number: "02", title: "Screen automatically", description: "Every resume is scored against the role, so the strongest matches surface first." },
  { number: "03", title: "Interview and decide", description: "Shortlisted candidates take an AI interview, and HR decides with a full report." }
];

export default function LandingPage() {
  const { user, role, loading } = useAuth();

  if (loading) return <LoadingState />;

  if (user) {
    const isHr = role === "hr";
    return (
      <div className="stack page-enter">
        <section className="card card-hero">
          <h1>Welcome back</h1>
          <p className="hero-lead">
            {isHr
              ? "Create pipelines, screen applicants, run interviews, and make decisions from one place."
              : "Track your applications, strengthen your resume, and stay ready for interview invites."}
          </p>
          <div className="actions">
            <Link className="btn" href={isHr ? "/hr" : "/dashboard"}>{isHr ? "Open HR dashboard" : "Open my dashboard"}</Link>
            {!isHr && <Link className="btn btn-secondary" href="/resume-tools"><Sparkles size={15} aria-hidden="true" /> Resume tools</Link>}
          </div>
        </section>
        <div className="grid grid-3">
          {STEPS.map((step) => (
            <div key={step.number} className="card">
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p className="page-subtitle">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack page-enter">
      <section className="card hero card-hero">
        <div>
          <span className="eyebrow">AI hiring for both sides of the table</span>
          <h1>A sharper way to hire, apply, and interview.</h1>
          <p className="hero-lead">
            ELEVATR gives candidates resume intelligence and clear progress tracking, and gives HR teams a faster path from job description to decision.
          </p>
          <div className="actions">
            <Link className="btn" href="/signup">Get started</Link>
            <Link className="btn btn-secondary" href="/resume-tools">Explore resume tools</Link>
          </div>
        </div>
        <div className="hero-panel">
          {MODULES.map(({ Icon, title, description }) => (
            <div key={title} className="module-row">
              <span className="icon-tile"><Icon size={18} aria-hidden="true" /></span>
              <div><strong>{title}</strong><span>{description}</span></div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-3">
        {STEPS.map((step) => (
          <div key={step.number} className="card">
            <span className="step-number">{step.number}</span>
            <h3>{step.title}</h3>
            <p className="page-subtitle">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
