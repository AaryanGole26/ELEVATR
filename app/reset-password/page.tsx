'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/shared/supabase/client';
import { Alert, LoadingState } from '@/shared/components/ui';

const LINK_CHECK_MS = 4000;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');

  // Supabase processes the token in the URL asynchronously, so wait briefly for the session.
  useEffect(() => {
    let settled = false;
    const accept = () => {
      settled = true;
      setLinkState('valid');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) accept();
    });

    // Links for accounts created by HR carry a one-time token for this page to verify.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    if (tokenHash && params.get('type') === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ data, error: verifyError }) => {
        if (!verifyError && data.session) accept();
        else setLinkState('invalid');
      });
    }

    const timer = window.setTimeout(async () => {
      if (settled || tokenHash) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) accept();
      else setLinkState('invalid');
    }, LINK_CHECK_MS);

    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      await supabase.auth.signOut();
      window.setTimeout(() => router.replace('/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (linkState === 'checking') return <LoadingState label="Checking your reset link..." />;

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card">
        <h1>Set a new password</h1>

        {linkState === 'invalid' ? (
          <>
            <Alert>This reset link is invalid or has expired. Links work once, for a limited time.</Alert>
            <Link href="/forgot-password" className="btn btn-block">Request a new link</Link>
          </>
        ) : done ? (
          <Alert kind="success">Your password has been updated. Taking you to sign in...</Alert>
        ) : (
          <>
            <p className="form-subtitle">Choose a new password for your ELEVATR account.</p>
            {error && <Alert>{error}</Alert>}
            <form onSubmit={handleSubmit} className="form">
              <div className="form-group">
                <label htmlFor="password">New password</label>
                <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving} required minLength={8} />
                <small>At least 8 characters</small>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={saving} required />
              </div>
              <button type="submit" disabled={saving} className="btn btn-block">
                {saving ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </>
        )}

        <div className="form-footer">
          <p>Back to <Link href="/login">sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
