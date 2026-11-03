"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="focus-page">
      <div className="card focus-card center">
        <h1>Something went wrong</h1>
        <p className="form-subtitle">We couldn&apos;t load this page. Your data is safe, so please try again.</p>
        <button type="button" className="btn" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
