import Link from "next/link";

export default function NotFound() {
  return (
    <div className="focus-page">
      <div className="card focus-card center">
        <h1>Page not found</h1>
        <p className="form-subtitle">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <Link className="btn" href="/">Back to home</Link>
      </div>
    </div>
  );
}
