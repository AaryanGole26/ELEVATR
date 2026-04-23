'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase } from '@/shared/supabase/client';

const RESET_COOLDOWN_MS = 60_000;

function isResetRateLimited(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { status?: number; message?: string };
  if (maybeError.status === 429) {
    return true;
  }

  return (maybeError.message || '').toLowerCase().includes('rate limit');
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      return;
    }

    const id = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (cooldownUntil > Date.now()) {
      return;
    }

    setLoading(true);

    try {
      const supabase = getBrowserSupabase();
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo
      });

      if (resetError) {
        throw resetError;
      }

      setMessage('Password reset link sent. Please check your email inbox.');
    } catch (err) {
      if (isResetRateLimited(err)) {
        setCooldownUntil(Date.now() + RESET_COOLDOWN_MS);
        setError('Email rate limit exceeded. Please wait 60 seconds before requesting another reset link.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000));

  return (
    <div className="form-container">
      <div className="form-card">
        <h1>Forgot Password</h1>
        <p className="form-subtitle">Enter your account email to receive a secure reset link.</p>

        {error && <div className="error-box">{error}</div>}
        {message && <div className="success-box">{message}</div>}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              required
            />
          </div>

          <button type="submit" disabled={loading || !email.trim() || cooldownSeconds > 0} className="btn btn-primary">
            {loading
              ? 'Sending...'
              : cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : 'Send Reset Link'}
          </button>
        </form>

        <div className="form-footer">
          <p>
            Back to <Link href="/login">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
