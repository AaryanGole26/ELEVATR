'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const validateRecoverySession = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        
        if (sessionErr) {
          console.error('Session error:', sessionErr);
        }

        if (session) {
          setHasSession(true);
          setReady(true);
          setChecking(false);
          return;
        }

        // If no session yet, listen for auth state changes
        // This handles the case where the recovery token is being processed
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('Auth state changed:', event, !!session);
          
          if (event === 'RECOVERY' || (event === 'SIGNED_IN' && session?.user?.recovery_sent_at)) {
            setHasSession(true);
            setReady(true);
            setChecking(false);
          } else if (event === 'SIGNED_OUT' || !session) {
            // Still waiting for recovery session to be processed
          }
        });

        // Wait a bit for Supabase to process the recovery token from the URL
        const startTime = Date.now();
        const timeout = setTimeout(() => {
          const { data: { session: finalSession } } = supabase.auth.getSession();
          
          if (!finalSession) {
            console.warn('Recovery session not detected after 3 seconds');
            setError(
              'Could not verify reset link. This may happen if: ' +
              '1) The link has expired (valid for 24 hours), ' +
              '2) The link was already used, or ' +
              '3) There\'s a network issue. Please request a new reset link.'
            );
            setReady(false);
          }
          
          subscription?.unsubscribe();
          setChecking(false);
        }, 3000);

        return () => {
          clearTimeout(timeout);
          subscription?.unsubscribe();
        };
      } catch (err) {
        console.error('Validation error:', err);
        setError(err instanceof Error ? err.message : 'Failed to validate reset link');
        setReady(false);
        setChecking(false);
      }
    };

    validateRecoverySession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!hasSession) {
      setError('Session expired. Please request a new reset link.');
      return;
    }

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

      setMessage('✓ Password updated successfully. Redirecting to login...');
      setPassword('');
      setConfirmPassword('');
      
      // Sign out the recovery session
      await supabase.auth.signOut();
      
      window.setTimeout(() => {
        router.replace('/login');
      }, 1500);
    } catch (err) {
      console.error('Password update error:', err);
      setError(err instanceof Error ? err.message : 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="form-container">
        <div className="form-card">
          <div className="spinner"></div>
          <p>Validating reset link...</p>
          <small style={{ marginTop: '10px', color: '#999' }}>This may take a few seconds</small>
        </div>
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

            <button type="submit" disabled={loading || !password || !confirmPassword} className="btn btn-primary">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        ) : (
          <div className="form-footer" style={{ marginTop: '20px' }}>
            <p style={{ color: '#d32f2f', marginBottom: '15px' }}>
              ⚠️ {error || 'Unable to process reset link'}
            </p>
            <Link href="/forgot-password" className="btn btn-secondary" style={{ display: 'inline-block' }}>
              Request New Reset Link
            </Link>
          </div>
        )}

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
