'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/shared/supabase/client';
import type { UserRole } from '@/shared/types';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves to true when the account still needs its email confirmed before it can sign in. */
  signUp: (email: string, password: string, role: UserRole) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;

function friendlyAuthError(error: { message?: string; status?: number; code?: string }): Error {
  const message = (error.message || '').toLowerCase();
  if (error.status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return new Error('Too many attempts. Please wait a minute and try again.');
  }
  if (error.code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return new Error('Invalid email or password.');
  }
  if (error.code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return new Error('Please confirm your email address, then sign in.');
  }
  if (error.code === 'user_already_exists' || message.includes('already registered')) {
    return new Error('An account with this email already exists. Try signing in instead.');
  }
  if (/failed to fetch|network|name_not_resolved/.test(message)) {
    return new Error('We could not reach the sign-in service. Check your connection and try again.');
  }
  return new Error(error.message || 'Authentication failed.');
}

async function fetchRole(supabase: SupabaseClient, user: User): Promise<UserRole | null> {
  const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (data?.role === 'candidate' || data?.role === 'hr') {
    return data.role;
  }
  // The row is created by a database trigger. This fallback only affects navigation:
  // API routes always re-check the role on the server.
  const metadataRole = user.user_metadata?.role;
  return metadataRole === 'candidate' || metadataRole === 'hr' ? metadataRole : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
    setUser(null);
    setRole(null);
    router.push('/login');
  }, [router, supabase]);

  // Signs the user out after a period of inactivity. Activity is kept in a ref so that
  // constant mouse movement does not re-render the whole application.
  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    const recordActivity = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, recordActivity, { passive: true }));

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current > SESSION_TIMEOUT_MS) {
        void signOut();
      }
    }, 30_000);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, recordActivity));
      window.clearInterval(timer);
    };
  }, [user, signOut]);

  useEffect(() => {
    let cancelled = false;
    let latestRequest = 0;

    const applySession = async (sessionUser: User | null) => {
      // Auth events can overlap. Only the newest may apply, or a slow role lookup that started
      // before a sign-out could finish last and restore the signed-out user.
      const request = ++latestRequest;
      const nextRole = sessionUser ? await fetchRole(supabase, sessionUser) : null;
      if (cancelled || request !== latestRequest) return;
      setUser(sessionUser);
      setRole(nextRole);
      setLoading(false);
    };

    supabase.auth
      .getUser()
      .then(({ data, error }) => applySession(error ? null : data.user))
      .catch((error) => {
        console.error('Failed to load session:', error);
        return applySession(null);
      });

    // Supabase warns against awaiting its own client inside this callback, so the work is deferred.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void applySession(session?.user ?? null), 0);
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(async (email: string, password: string) => {
    let response;
    try {
      response = await supabase.auth.signInWithPassword({ email, password });
    } catch (error) {
      throw friendlyAuthError(error as { message?: string });
    }
    if (response.error) throw friendlyAuthError(response.error);
  }, [supabase]);

  const signUp = useCallback(async (email: string, password: string, selectedRole: UserRole) => {
    let response;
    try {
      response = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role: selectedRole } }
      });
    } catch (error) {
      throw friendlyAuthError(error as { message?: string });
    }
    if (response.error) throw friendlyAuthError(response.error);
    return !response.data.session;
  }, [supabase]);

  const value = useMemo(
    () => ({ user, role, loading, signIn, signUp, signOut }),
    [user, role, loading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
