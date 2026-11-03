'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/shared/auth-context';
import { LoadingState } from '@/shared/components/ui';
import type { UserRole } from '@/shared/types';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

/** Page-level navigation guard. API routes enforce access independently on the server. */
export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, loading } = useAuth();
  const roleAllowed = !requiredRole || role === requiredRole;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}` as never);
    } else if (!roleAllowed) {
      router.replace(role === 'hr' ? '/hr' : '/dashboard');
    }
  }, [user, role, loading, roleAllowed, router, pathname]);

  if (loading || !user || !roleAllowed) {
    return <LoadingState />;
  }

  return <>{children}</>;
}
