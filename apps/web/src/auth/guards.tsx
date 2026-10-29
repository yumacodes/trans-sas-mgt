import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Permission } from '@tsm/shared';
import { FullScreenLoader } from '@/components/app/FullScreenLoader';
import { ErrorState } from '@/components/app/States';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { errorMessage } from '@/lib/api';
import { useAuth } from './AuthProvider';

/** Only allows relative in-app paths as post-login destinations (prevents open redirects). */
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/login')) return '/';
  return next;
}

/**
 * Renders protected routes only once the session and profile are confirmed. While the
 * status is unresolved nothing protected is shown.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, meError, retryMe, signOut } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoader label="Checking your session…" />;
  if (status === 'signedOut') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState
          title="We couldn't load your account"
          message={errorMessage(meError)}
          onRetry={retryMe}
          secondaryAction={{ label: 'Sign out', onClick: () => void signOut() }}
        />
      </div>
    );
  }
  return children ?? <Outlet />;
}

interface RequirePermissionProps {
  /** The user needs at least one of these permissions. */
  anyOf: Permission[];
  children?: ReactNode;
}

export function RequirePermission({ anyOf, children }: RequirePermissionProps) {
  const { canAny } = useAuth();
  if (!canAny(...anyOf)) return <ForbiddenPage />;
  return children ?? <Outlet />;
}

/** Renders children only when the user holds the permission (for buttons and actions). */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? children : null;
}
