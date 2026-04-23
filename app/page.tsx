"use client";

import Link from "next/link";
import { useAuth } from "@/shared/auth-context";

export default function LandingPage() {
  const { user, role, loading } = useAuth();

  const showCandidateView = !!user && (role === "candidate" || role === null);
  const showHRView = !!user && role === "hr";

  const platformStats = [
    { value: "1 platform", label: "for candidates and HR" },
    { value: "Fast screening", label: "from JD to shortlist" },
    { value: "Interview ready", label: "resume and workflow tools" },
  ];

  const highlights = [
    {
      title: "Resume intelligence",
      description: "Score resumes, close skill gaps, and tailor applications before you hit submit.",
    },
    {
      title: "Hiring pipelines",
      description: "Create JD-driven workflows with screening, interview, and decision stages.",
    },
    {
      title: "One clean workspace",
      description: "Switch between candidate and HR tasks without juggling separate tools.",
    },
  ];

  const steps = [
    {
      number: "01",
      title: "Start with a role",
      description: "Upload a resume or paste a job description to build the right workflow immediately.",
    },
    {
      number: "02",
      title: "Let AI narrow the field",
      description: "Use scoring and screening to surface the strongest matches without manual sorting.",
    },
    {
      number: "03",
      title: "Move faster to decisions",
      description: "Review progress, schedule interviews, and keep the process moving in one place.",
    },
  ];

  if (loading) {
    return (
      <section className="stack">
        <div className="card stack">
          <h1 className="m0">Loading your workspace...</h1>
          <p className="m0">Preparing the best view for your account.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="stack anim-fade">
      {showCandidateView ? (
        <>
          <div className="card stack hero-gradient anim-fade-up">
            <h1 className="m0">Welcome Back, Candidate</h1>
            <p className="m0">
              Track your applications, improve your resume, and stay interview-ready from one dashboard.
            </p>
            <div className="inlineActions wrap">
              <Link className="btn" href="/dashboard">
                Open My Dashboard
              </Link>
              <Link className="btn secondary" href="/resume-tools">
                Analyze Resume
              </Link>
              <Link className="btn secondary" href="/resume-builder">
                Build Resume
              </Link>
            </div>
          </div>
          <div className="row three">
            <div className="card anim-fade-up anim-delay-1">
              <h3>1. Improve Resume</h3>
              <p>Use AI analysis to close skill gaps and increase matching score quickly.</p>
            </div>
            <div className="card anim-fade-up anim-delay-2">
              <h3>2. Apply Smarter</h3>
              <p>Submit stronger applications and monitor progress stage-by-stage in dashboard.</p>
            </div>
            <div className="card anim-fade-up anim-delay-3">
              <h3>3. Ace Interviews</h3>
              <p>Complete AI interview rounds and receive updates without missing any step.</p>
            </div>
          </div>
        </>
      ) : showHRView ? (
        <>
          <div className="card stack hero-gradient anim-fade-up">
            <h1 className="m0">JD-Driven AI Hiring Pipeline</h1>
            <p className="m0">
              Create pipelines, screen applications, run interviews, and make decisions from one unified HR cockpit.
            </p>
            <div className="inlineActions wrap">
              <Link className="btn" href="/hr">
                Create Pipeline
              </Link>
              <Link className="btn secondary" href="/hr">
                Open HR Dashboard
              </Link>
            </div>
          </div>
          <div className="row three">
            <div className="card anim-fade-up anim-delay-1">
              <h3>1. Pipeline Creation</h3>
              <p>Paste JD, tags, and threshold to launch new hiring tracks in minutes.</p>
            </div>
            <div className="card anim-fade-up anim-delay-2">
              <h3>2. AI Screening</h3>
              <p>Auto-score applicants against role requirements to reduce manual workload.</p>
            </div>
            <div className="card anim-fade-up anim-delay-3">
              <h3>3. Interview + Decision</h3>
              <p>Shortlist, interview, and communicate decisions from one consistent workflow.</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="landingHero card anim-fade-up">
            <div className="landingHeroContent stack">
              <div className="eyebrowPill anim-scale">AI hiring, built for both sides of the table</div>
              <h1 className="landingTitle">A sharper way to hire, apply, and stay interview-ready.</h1>
              <p className="landingLead">
                ELEVATR gives candidates resume intelligence and progress tracking while helping HR teams create
                cleaner pipelines, screen faster, and move from JD to decision without friction.
              </p>
              <div className="inlineActions wrap">
                <Link className="btn" href="/signup">
                  Get Started
                </Link>
                <Link className="btn btn-secondary" href="/resume-tools">
                  Explore Resume Tools
                </Link>
                <Link className="btn btn-secondary" href="/login">
                  Login
                </Link>
              </div>
              <div className="landingStats">
                {platformStats.map((stat) => (
                  <div key={stat.label} className="landingStat">
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="landingPanel anim-scale anim-delay-2">
              <div className="landingPanelHeader">
                <span>Workspace snapshot</span>
                <strong>Candidate + HR</strong>
              </div>
              <div className="landingPanelCard">
                <span className="panelTag">Smart screening</span>
                <h3>From resume upload to shortlist in fewer steps.</h3>
                <p>Use AI to separate strong fits from noise, then keep the hiring flow moving.</p>
              </div>
              <div className="landingPanelList">
                <div>
                  <strong>Resume Builder</strong>
                  <span>Polish applications with guided improvements.</span>
                </div>
                <div>
                  <strong>HR Pipeline</strong>
                  <span>Build reusable role-based hiring flows.</span>
                </div>
                <div>
                  <strong>Interview Workflow</strong>
                  <span>Move candidates through interview stages cleanly.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="row three landingHighlights">
            {highlights.map((item, i) => (
              <div key={item.title} className={`card landingFeatureCard anim-fade-up anim-delay-${i + 1}`}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>

          <div className="landingSplit">
            <div className="card landingAudienceCard anim-fade-up anim-delay-1">
              <div className="sectionLabel">For Candidates</div>
              <h2>Build a better application once, then reuse it everywhere.</h2>
              <p>
                Improve resumes with AI, track opportunities, and keep your job search organized from a single
                dashboard.
              </p>
              <Link className="btn btn-secondary landingCardAction" href="/resume-builder">
                Open Resume Builder
              </Link>
            </div>
            <div className="card landingAudienceCard accent anim-fade-up anim-delay-2">
              <div className="sectionLabel">For HR Teams</div>
              <h2>Turn a JD into a structured hiring flow in minutes.</h2>
              <p>
                Create pipelines, screen candidates, and coordinate interviews with a cleaner, more focused system.
              </p>
              <Link className="btn btn-secondary landingCardAction" href="/hr">
                Open HR Dashboard
              </Link>
            </div>
          </div>

          <div className="card landingSteps anim-fade-up anim-delay-2">
            <div className="sectionLabel">How it works</div>
            <div className="row three">
              {steps.map((step) => (
                <div key={step.number} className="landingStep">
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}