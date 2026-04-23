'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/auth-context';
import type { UserRole } from '@/shared/types';

const SIGNUP_COOLDOWN_KEY = 'elevatr_signup_cooldown_until';

export default function SignupPage() {
  const router = useRouter();
  const { signUp, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('hr');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    if (user) {
      router.replace(role === 'hr' ? '/hr' : '/dashboard');
    }
  }, [user, role, router]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      return;
    }

    const id = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SIGNUP_COOLDOWN_KEY);
    if (!raw) {
      return;
    }

    const ts = Number(raw);
    if (Number.isFinite(ts) && ts > Date.now()) {
      setCooldownUntil(ts);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (cooldownUntil > Date.now()) {
        throw new Error('Please wait before trying again.');
      }

      if (!email || !password || !confirmPassword) {
        throw new Error('Please fill in all fields');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      await signUp(email, password, role);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      setError(message);

      if (message.toLowerCase().includes('rate limit')) {
        setCooldownUntil(Date.now() + 60_000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - nowTs) / 1000));

  if (authLoading) {
    return (
      <div className="form-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="form-container">
      <div className="form-card">
        <h1>Create Account</h1>
        <p className="form-subtitle">Join ELEVATR's AI hiring platform as HR by default.</p>

        {error && <div className="error-box">{error}</div>}
        {error && (
          <div className="inlineActions wrap" style={{ marginBottom: '12px' }}>
            <Link href="/login" className="btn btn-secondary">
              Go To Login
            </Link>
            <Link href="/forgot-password" className="btn btn-secondary">
              Forgot Password
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
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
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label>Account Type</label>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="role"
                  value="candidate"
                  checked={role === 'candidate'}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  disabled={isLoading}
                />
                <span>
                  <strong>Candidate</strong>
                  <br />
                  <small>Apply to jobs, take interviews</small>
                </span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="role"
                  value="hr"
                  checked={role === 'hr'}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  disabled={isLoading}
                />
                <span>
                  <strong>HR / Recruiter</strong>
                  <br />
                  <small>Create pipelines, review candidates</small>
                </span>
              </label>
            </div>
          </div>

          <button type="submit" disabled={isLoading || cooldownSeconds > 0} className="btn btn-primary">
            {isLoading
              ? 'Creating account...'
              : cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : 'Sign Up'}
          </button>
        </form>

        <div className="form-footer">
          <p>Already have an account? <Link href="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
