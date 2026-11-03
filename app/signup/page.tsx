'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/auth-context';
import { Alert, LoadingState } from '@/shared/components/ui';
import type { UserRole } from '@/shared/types';

export default function SignupPage() {
  const router = useRouter();
  const { signUp, user, role: accountRole, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('candidate');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  useEffect(() => {
    if (user) router.replace(accountRole === 'hr' ? '/hr' : '/dashboard');
  }, [user, accountRole, router]);

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

    setSubmitting(true);
    try {
      setNeedsConfirmation(await signUp(email.trim(), password, role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) return <LoadingState />;

  if (needsConfirmation) {
    return (
      <div className="focus-page page-enter">
        <div className="card focus-card center">
          <h1>Check your email</h1>
          <p className="form-subtitle">We sent a confirmation link to {email}. Open it to activate your account, then sign in.</p>
          <Link className="btn" href="/login">Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="focus-page page-enter">
      <div className="card focus-card">
        <h1>Create your account</h1>
        <p className="form-subtitle">Join ELEVATR as a candidate or a recruiter.</p>

        {error && <Alert>{error}</Alert>}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <span className="form-label" id="account-type">I am a</span>
            <div className="choice-group" role="radiogroup" aria-labelledby="account-type">
              <label className="choice">
                <input type="radio" name="role" value="candidate" checked={role === 'candidate'} onChange={() => setRole('candidate')} disabled={submitting} />
                <span><strong>Candidate</strong><small>Apply and interview</small></span>
              </label>
              <label className="choice">
                <input type="radio" name="role" value="hr" checked={role === 'hr'} onChange={() => setRole('hr')} disabled={submitting} />
                <span><strong>Recruiter</strong><small>Create hiring pipelines</small></span>
              </label>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={submitting} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required minLength={8} />
            <small>At least 8 characters</small>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} required />
          </div>
          <button type="submit" disabled={submitting} className="btn btn-block">
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="form-footer">
          <p>Already have an account? <Link href="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
