'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/shared/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const validateRecoverySession = async () => {
      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        setError(sessionErr.message);
        setReady(false);
        setChecking(false);
        return;
      }

      if (!data.session) {
        setError('Reset link is invalid or expired. Request a new one.');
        setReady(false);
        setChecking(false);
        return;
      }

      setReady(true);
      setChecking(false);
    };

    validateRecoverySession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        throw updateErr;
      }

      setMessage('Password updated successfully. Redirecting to login...');
      window.setTimeout(() => {
        router.replace('/login');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="form-container">
        <div className="spinner"></div>
        <p>Validating reset link...</p>
      </div>
    );
  }

  return (
    <div className="form-container">
      <div className="form-card">
        <h1>Set New Password</h1>
        <p className="form-subtitle">Create a new password for your ELEVATR account.</p>

        {error && <div className="error-box">{error}</div>}
        {message && <div className="success-box">{message}</div>}

        {ready ? (
          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="password">New Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                required
              />
              <small>At least 8 characters</small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : null}

        <div className="form-footer">
          <p>
            Back to <Link href="/login">Login</Link>
          </p>
          <p>
            Need a fresh link? <Link href="/forgot-password">Forgot Password</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
