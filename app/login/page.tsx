'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/auth-context';
import { Alert, LoadingState } from '@/shared/components/ui';

/** Only same-site paths are allowed: "//evil.com" also starts with "/" but leaves the site. */
function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, role, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const next = safeNextPath(new URL(window.location.href).searchParams.get('next'));
    router.replace((next ?? (role === 'hr' ? '/hr' : '/dashboard')) as never);
  }, [user, role, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) return <LoadingState />;

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card">
        <h1>Welcome back</h1>
        <p className="form-subtitle">Sign in to your ELEVATR account.</p>

        {error && <Alert>{error}</Alert>}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={submitting} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required />
          </div>
          <button type="submit" disabled={submitting} className="btn btn-block">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="form-footer">
          <p><Link href="/forgot-password">Forgot your password?</Link></p>
          <p>New to ELEVATR? <Link href="/signup">Create an account</Link></p>
        </div>
      </div>
    </div>
  );
}
