'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase } from '@/shared/supabase/client';
import { Alert } from '@/shared/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: resetError } = await getBrowserSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setError(status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'We could not send the reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card">
        <h1>Reset your password</h1>
        <p className="form-subtitle">Enter your account email and we&apos;ll send you a secure reset link.</p>

        {error && <Alert>{error}</Alert>}
        {sent ? (
          <Alert kind="success">If an account exists for {email}, a reset link is on its way. Please check your inbox.</Alert>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={loading} required />
            </div>
            <button type="submit" disabled={loading || !email.trim()} className="btn btn-block">
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="form-footer">
          <p>Back to <Link href="/login">sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
