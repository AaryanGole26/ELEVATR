'use client';

import { useAuth } from '@/shared/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { UserRole } from '@/shared/types';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const roleAllowed = !requiredRole || role === requiredRole || (requiredRole === 'candidate' && role === null);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!roleAllowed) {
        router.push('/');
      }
    }
  }, [user, loading, roleAllowed, router]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!roleAllowed) {
    return null;
  }

  return <>{children}</>;
}
