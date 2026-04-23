'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/shared/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, role, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const searchParams = new URL(window.location.href).searchParams;
      const nextUrl = searchParams.get('next');
      if (nextUrl && nextUrl.startsWith('/')) {
        router.replace(nextUrl as any);
      } else {
        router.replace(role === 'hr' ? '/hr' : '/dashboard');
      }
    }
  }, [user, role, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!email || !password) {
        throw new Error('Please fill in all fields');
      }

      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
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
        <h1>Login</h1>
        <p className="form-subtitle">Sign in to your ELEVATR account</p>

        {error && <div className="error-box">{error}</div>}

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
          </div>

          <button type="submit" disabled={isLoading} className="btn btn-primary">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="form-footer">
          <p><Link href="/forgot-password">Forgot Password?</Link></p>
        </div>

        <div className="form-footer">
          <p>Don't have an account? <Link href="/signup">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}
