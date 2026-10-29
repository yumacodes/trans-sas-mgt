import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAuth } from '@/test/authMock';
import type { AuthContextValue } from './AuthProvider';

let auth: AuthContextValue = fakeAuth();
vi.mock('./AuthProvider', () => ({ useAuth: () => auth }));

const { RequireAuth, RequirePermission, safeNextPath } = await import('./guards');

function LoginProbe() {
  const location = useLocation();
  return <p>login page {location.search}</p>;
}

function renderAt(path: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    auth = fakeAuth();
  });

  it('redirects signed-out users to login and preserves the destination', () => {
    auth = fakeAuth({ status: 'signedOut' });
    renderAt('/clients?status=active', <RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText(/login page/)).toHaveTextContent(
      `?next=${encodeURIComponent('/clients?status=active')}`,
    );
  });

  it('shows nothing protected while the session is unresolved', () => {
    auth = fakeAuth({ status: 'loading' });
    renderAt('/clients', <RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
  });

  it('renders protected content for a signed-in user', () => {
    renderAt('/clients', <RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('offers retry and sign-out when the profile cannot be loaded', () => {
    auth = fakeAuth({ status: 'error' });
    renderAt('/clients', <RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});

describe('RequirePermission', () => {
  it('blocks users without the permission', () => {
    auth = fakeAuth({ permissions: ['clients.read'] });
    renderAt('/admin/users', <RequirePermission anyOf={['users.manage']}><p>user admin</p></RequirePermission>);
    expect(screen.queryByText('user admin')).not.toBeInTheDocument();
    expect(screen.getByText(/don.t have access to this page/i)).toBeInTheDocument();
  });

  it('allows users holding any of the listed permissions', () => {
    auth = fakeAuth({ permissions: ['roles.manage'] });
    renderAt(
      '/admin/roles',
      <RequirePermission anyOf={['users.manage', 'roles.manage']}><p>roles</p></RequirePermission>,
    );
    expect(screen.getByText('roles')).toBeInTheDocument();
  });
});

describe('safeNextPath', () => {
  it('accepts in-app paths only', () => {
    expect(safeNextPath('/clients?x=1')).toBe('/clients?x=1');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/login')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});
