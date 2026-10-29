import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type Permission } from '@tsm/shared';
import { fakeAuth } from '@/test/authMock';
import type { AuthContextValue } from '@/auth/AuthProvider';
import { filterNav, NAV } from './nav';

let auth: AuthContextValue = fakeAuth();
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/queries', () => ({ useResetRequests: () => ({ data: [{ id: 'r1' }, { id: 'r2' }] }) }));
const { Sidebar } = await import('./Sidebar');

function renderSidebar(permissions: Permission[], path = '/') {
  auth = fakeAuth({ permissions });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar mobileOpen={false} onMobileClose={() => {}} />
    </MemoryRouter>,
  );
}

const labels = (perms: Permission[]) => {
  const set = new Set(perms);
  const out: string[] = [];
  const walk = (items: ReturnType<typeof filterNav>) =>
    items.forEach((i) => {
      out.push(i.label);
      if (i.children) walk(i.children);
    });
  walk(filterNav(NAV, (...ps) => ps.some((p) => set.has(p))));
  return out;
};

describe('navigation visibility', () => {
  it('shows administration only to admins', () => {
    expect(labels(DEFAULT_ROLE_PERMISSIONS.admin.permissions)).toEqual(
      expect.arrayContaining(['Admin', 'Users', 'Roles & Permissions', 'Company Profile']),
    );
    // Support and accountants hold branches.read, so Admin shows only the Branches entry.
    const support = labels(DEFAULT_ROLE_PERMISSIONS.support.permissions);
    expect(support).toContain('Branches');
    expect(support).not.toContain('Users');
    expect(support).not.toContain('Roles & Permissions');
    expect(support).not.toContain('Company Profile');
    expect(labels(DEFAULT_ROLE_PERMISSIONS.accountant.permissions)).not.toContain('Users');
  });

  it('gives support no finance or reports sections', () => {
    const support = labels(DEFAULT_ROLE_PERMISSIONS.support.permissions);
    expect(support).toEqual(expect.arrayContaining(['Clients', 'Stock Items', 'Proforma']));
    expect(support).not.toContain('Payment');
    expect(support).not.toContain('Expenses');
    expect(support).not.toContain('Income Statement');
  });

  it('drops groups with no visible children', () => {
    expect(labels(['purchases.read'])).toEqual(['Purchase']);
    expect(labels([])).toEqual([]);
  });

  it('renders permitted modules as links and hides the rest', () => {
    renderSidebar(['clients.read', 'sales.read']);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /clients/i })).toHaveAttribute('href', '/clients');
    expect(within(nav).getByRole('link', { name: /sales/i })).toHaveAttribute('href', '/sales');
    expect(within(nav).queryByRole('link', { name: /payment/i })).not.toBeInTheDocument();
    expect(within(nav).queryByText('Admin')).not.toBeInTheDocument();
  });

  it('opens the section containing the current page', () => {
    renderSidebar(ALL_PERMISSIONS, '/admin/users');
    expect(screen.getByRole('button', { name: /admin/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /^Users/ })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the number of open password-reset requests on the Users link', () => {
    renderSidebar(ALL_PERMISSIONS, '/admin/users');
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /users/i })).toHaveTextContent('2');
  });
});
