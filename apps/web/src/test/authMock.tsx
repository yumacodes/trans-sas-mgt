import { vi } from 'vitest';
import type { MeDto, Permission } from '@tsm/shared';
import type { AuthContextValue, AuthStatus } from '@/auth/AuthProvider';

/** Builds a fake auth context for components that call useAuth(). */
export function fakeAuth(
  opts: { status?: AuthStatus; permissions?: Permission[]; me?: Partial<MeDto> } = {},
): AuthContextValue {
  const permissions = new Set(opts.permissions ?? []);
  const status = opts.status ?? 'signedIn';
  const me: MeDto | null =
    status === 'signedIn'
      ? {
          user: {
            id: 'u1',
            email: 'ama@example.com',
            username: 'ama',
            fullName: 'Ama Mensah',
            phone: null,
            roles: [{ id: 'r1', key: 'support', name: 'Support' }],
            branches: [],
          },
          permissions: [...permissions],
          allBranches: false,
          company: { name: 'Test Medical Ltd', defaultCurrency: 'GHS', logoUrl: null },
          ...opts.me,
        }
      : null;
  return {
    status,
    session: null,
    me,
    meError: null,
    retryMe: vi.fn(),
    can: (p) => permissions.has(p),
    canAny: (...ps) => ps.some((p) => permissions.has(p)),
    signOut: vi.fn(async () => {}),
    notice: null,
    clearNotice: vi.fn(),
  };
}
