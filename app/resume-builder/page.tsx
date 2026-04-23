"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clientSideFrontendUrl, getClientSideFrontendRoute } from "@/shared/client-side";

export default function ResumeBuilderPage() {
  const builderUrl = getClientSideFrontendRoute("/buildcv");
  const analyzerUrl = getClientSideFrontendRoute("/upload");
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    const externalTab = window.open(builderUrl, "_blank", "noopener,noreferrer");
    if (!externalTab) {
      setPopupBlocked(true);
    }
  }, [builderUrl]);

  return (
    <section className="stack">
      <div className="card stack">
        <h2 className="m0">Resume Builder Launched</h2>
        <p className="m0">
          The full builder UI opens in a new tab so Elevatr remains on port 3000.
        </p>
        <p className="m0">Target frontend: {clientSideFrontendUrl}</p>
        {popupBlocked ? (
          <p className="m0" style={{ color: "#b42318" }}>
            Your browser blocked the new tab. Use the button below to open it manually.
          </p>
        ) : null}
        <div className="inlineActions wrap">
          <a className="btn" href={builderUrl} target="_blank" rel="noreferrer">
            Open Builder In New Tab
          </a>
          <a className="btn secondary" href={analyzerUrl} target="_blank" rel="noreferrer">
            Open Analyzer In New Tab
          </a>
          <Link className="btn secondary" href="/resume-tools">
            Open Analyzer Redirect Page
          </Link>
          <Link className="btn secondary" href="/">
            Back To Elevatr Home
          </Link>
        </div>
      </div>
    </section>
  );
}
