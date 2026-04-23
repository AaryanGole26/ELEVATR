"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/shared/auth-context";
import { clientSideFrontendUrl, getClientSideFrontendRoute } from "@/shared/client-side";

export default function ResumeToolsPage() {
  const { user, loading } = useAuth();
  const [popupBlocked, setPopupBlocked] = useState(false);

  // We wait for auth to finish loading to determine the right path
  const targetPath = user ? "/upload" : "/";
  const analyzerUrl = getClientSideFrontendRoute(targetPath);
  const builderUrl = getClientSideFrontendRoute("/buildcv");

  useEffect(() => {
    if (loading) return;
    
    // Open the appropriate URL on load
    const externalTab = window.open(analyzerUrl, "_blank", "noopener,noreferrer");
    if (!externalTab) {
      setPopupBlocked(true);
    }
  }, [analyzerUrl, loading]);

  if (loading) {
    return (
      <section className="stack">
        <div className="glass-card stack" style={{ alignItems: 'center', padding: '40px' }}>
          <div className="spinner"></div>
          <p>Authenticating...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="glass-card stack">
        <h2 className="m0 mb-sm">Analyzer Launched</h2>
        <p className="m0 muted-text">The analyzer opens in a new tab so you stay on Elevatr at port 3000.</p>
        <p className="m0 muted-text">Target frontend: {clientSideFrontendUrl}{targetPath}</p>
        {popupBlocked ? (
          <p className="m0" style={{ color: "#ef4444" }}>
            Your browser blocked the new tab. Use the button below to open it manually.
          </p>
        ) : null}
        <div className="inlineActions wrap mt-sm">
          <a className="btn" href={analyzerUrl} target="_blank" rel="noreferrer">
            Open Analyzer In New Tab
          </a>
          <a className="btn secondary" href={builderUrl} target="_blank" rel="noreferrer">
            Open Resume Builder In New Tab
          </a>
          <Link className="btn secondary" href="/resume-builder">
            Go To Resume Builder Page
          </Link>
          <Link className="btn secondary" href="/">
            Back To Elevatr Home
          </Link>
        </div>
      </div>
    </section>
  );
}