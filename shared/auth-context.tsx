'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/shared/supabase/client';
import type { UserRole } from '@/shared/types';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_AUTH_KEY = 'elevatr_local_auth';
const SIGNUP_COOLDOWN_KEY = 'elevatr_signup_cooldown_until';
const SIGNUP_COOLDOWN_MS = 60_000;
const SESSION_TIMEOUT_MS = 60 * 15 * 1000; // 15 minutes in ms
const ENABLE_LOCAL_AUTH_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_LOCAL_AUTH_FALLBACK === 'true';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

type LocalAuthRecord = {
  id: string;
  email: string;
  password: string;
  role: UserRole;
};

type LocalAuthSession = {
  id: string;
  email: string;
  role: UserRole;
};

function getRoleFromUserMetadata(user: User | null): UserRole | null {
  const rawRole = user?.user_metadata?.role;
  if (rawRole === 'candidate' || rawRole === 'hr') {
    return rawRole;
  }
  return null;
}

function isNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|network|name_not_resolved|fetch/i.test(error.message);
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { status?: number; message?: string };
  if (maybeError.status === 429) return true;
  const msg = (maybeError.message || '').toLowerCase();
  return msg.includes('too many requests') || msg.includes('rate limit');
}

function isInvalidCredentialsError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { status?: number; message?: string; code?: string };
  const msg = (maybeError.message || '').toLowerCase();
  if (maybeError.status === 400 && (msg.includes('invalid login credentials') || msg.includes('email not confirmed'))) return true;
  return maybeError.code === 'invalid_credentials';
}

function isUserAlreadyRegisteredError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { message?: string; code?: string };
  const msg = (maybeError.message || '').toLowerCase();
  return maybeError.code === 'user_already_exists' || msg.includes('user already registered');
}

function createLocalUser(session: LocalAuthSession) {
  return {
    id: session.id,
    email: session.email,
    role: session.role,
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as unknown as User;
}

function readLocalStore(): { users: LocalAuthRecord[]; session: LocalAuthSession | null } {
  if (typeof window === 'undefined') return { users: [], session: null };
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_KEY);
    if (!raw) return { users: [], session: null };
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      session: parsed.session ?? null
    };
  } catch {
    return { users: [], session: null };
  }
}

function writeLocalStore(payload: { users: LocalAuthRecord[]; session: LocalAuthSession | null }) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(payload));
}

function getSignupCooldownUntil(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(SIGNUP_COOLDOWN_KEY)) || 0;
}

function clearSignupCooldown() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SIGNUP_COOLDOWN_KEY);
}

function getSupabaseUnreachableMessage() {
  let host = SUPABASE_URL;
  try {
    host = new URL(SUPABASE_URL).host;
  } catch {
    // Keep raw value if URL parsing fails so the user can spot malformed config.
  }

  return `Cannot reach Supabase (${host || 'NEXT_PUBLIC_SUPABASE_URL not set'}). Check NEXT_PUBLIC_SUPABASE_URL and your DNS/internet connection.`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const router = useRouter();

  const signOut = async () => {
    setLoading(true);
    try {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        if (!isNetworkFailure(error)) console.error('Supabase SignOut error:', error);
      }

      if (typeof window !== 'undefined') {
        const localStore = readLocalStore();
        writeLocalStore({ users: localStore.users, session: null });
        window.localStorage.removeItem(LOCAL_AUTH_KEY);
      }

      setUser(null);
      setRole(null);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  // Inactivity timeout logic
  useEffect(() => {
    if (!user) return;

    const updateActivity = () => setLastActivity(Date.now());
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    
    events.forEach(e => window.addEventListener(e, updateActivity));

    const checkTimeout = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
        console.warn('Session timed out');
        signOut();
      }
    }, 30000); // Check every 30s

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity));
      clearInterval(checkTimeout);
    };
  }, [user, lastActivity]);

  useEffect(() => {
    const fetchUserAndRole = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          if (!ENABLE_LOCAL_AUTH_FALLBACK) {
            setUser(null); setRole(null); setLoading(false); return;
          }
          const localStore = readLocalStore();
          if (localStore.session) {
            setUser(createLocalUser(localStore.session));
            setRole(localStore.session.role);
          } else {
            setUser(null); setRole(null);
          }
          setLoading(false); return;
        }

        setUser(user);
        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        setRole((userData?.role as UserRole) || getRoleFromUserMetadata(user));
      } catch (error) {
        console.error('Fetch user error:', error);
        setUser(null); setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        const { data: userData } = await supabase.from('users').select('role').eq('id', session.user.id).maybeSingle();
        setRole((userData?.role as UserRole) || getRoleFromUserMetadata(session.user));
      } else {
        if (!ENABLE_LOCAL_AUTH_FALLBACK) {
          setUser(null); setRole(null); return;
        }
        const localStore = readLocalStore();
        if (localStore.session) {
          setUser(createLocalUser(localStore.session));
          setRole(localStore.session.role);
        } else {
          setUser(null); setRole(null);
        }
      }
    });

    return () => subscription?.unsubscribe();
  }, [supabase]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (isRateLimitError(error)) throw new Error('Too many attempts. Wait 60s.');
        if (isInvalidCredentialsError(error)) throw new Error('Invalid email or password.');
        if (!isNetworkFailure(error)) throw error;
        if (!ENABLE_LOCAL_AUTH_FALLBACK) throw new Error(getSupabaseUnreachableMessage());

        const localStore = readLocalStore();
        const matched = localStore.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (!matched) throw new Error('Demo account not found.');

        const sess = { id: matched.id, email: matched.email, role: matched.role };
        writeLocalStore({ users: localStore.users, session: sess });
        setUser(createLocalUser(sess));
        setRole(matched.role);
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, selectedRole: UserRole) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { role: selectedRole } }
      });
      if (error) {
        if (isUserAlreadyRegisteredError(error)) throw new Error('Email already exists.');
        if (!isNetworkFailure(error)) throw error;
        if (!ENABLE_LOCAL_AUTH_FALLBACK) throw new Error(getSupabaseUnreachableMessage());

        const localStore = readLocalStore();
        const rec = { id: crypto.randomUUID(), email, password, role: selectedRole };
        writeLocalStore({ users: [...localStore.users.filter(u => u.email !== email), rec], session: { id: rec.id, email: rec.email, role: rec.role } });
        setUser(createLocalUser(rec));
        setRole(selectedRole);
        router.push('/');
        return;
      }
      if (data.user) {
        await supabase.from('users').insert({ id: data.user.id, email, role: selectedRole });
        setRole(selectedRole); setUser(data.user);
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
