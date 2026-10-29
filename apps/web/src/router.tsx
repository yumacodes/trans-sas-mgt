import { SAMPLE_PAGES } from '@/features/samples/registry';
import { lazy } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RequireAuth, RequirePermission } from '@/auth/guards';
import { AppShell } from '@/layout/AppShell';
import type { RouteHandle } from '@/layout/Topbar';
import { useAuth } from '@/auth/AuthProvider';
import { NotFoundPage } from '@/pages/NotFoundPage';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const RegistrationsPage = lazy(() => import('@/pages/registrations/RegistrationsPage'));
const StockItemsPage = lazy(() => import('@/pages/stock/StockItemsPage'));
const CommunicationPage = lazy(() => import('@/pages/communication/CommunicationPage'));
const StockBalancesPage = lazy(() => import('@/pages/stock/StockBalancesPage'));
const CompanyProfilePage = lazy(() => import('@/pages/admin/CompanyProfilePage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const RolesPage = lazy(() => import('@/pages/admin/RolesPage'));
const BranchesPage = lazy(() => import('@/pages/admin/BranchesPage'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));

const SampleRoute = lazy(() => import('@/features/samples/SampleRoute'));

const h = (title: string, section?: string): RouteHandle => ({ title, section });

/** Users without dashboard access land on the first module they can open. */
function HomeRoute() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <DashboardPage />;
  if (can('clients.read')) return <Navigate to="/clients" replace />;
  if (can('stock_items.read')) return <Navigate to="/stock-items" replace />;
  return <Navigate to="/account" replace />;
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRoute />, handle: h('Dashboard', 'Overview') },
      {
        path: 'clients',
        element: <RequirePermission anyOf={['clients.read']} />,
        children: [{ index: true, element: <ClientsPage />, handle: h('Clients', 'Records') }],
      },
      {
        path: 'registered-clients',
        element: <RequirePermission anyOf={['registrations.read']} />,
        children: [
          { index: true, element: <RegistrationsPage />, handle: h('Registered Clients', 'Records') },
        ],
      },
      {
        path: 'communication',
        element: <RequirePermission anyOf={['messages.read', 'messages.send']} />,
        children: [
          {
            index: true,
            element: <CommunicationPage />,
            handle: h('Communication', 'Communication'),
          },
        ],
      },
      {
        path: 'stock-items',
        element: <RequirePermission anyOf={['stock_items.read']} />,
        children: [{ index: true, element: <StockItemsPage />, handle: h('Stock Items', 'Records') }],
      },
      {
        path: 'stock',
        element: <RequirePermission anyOf={['inventory.read']} />,
        children: [
          { index: true, element: <StockBalancesPage />, handle: h('Stock', 'Stock Management') },
        ],
      },
      {
        path: 'admin',
        children: [
          {
            path: 'company',
            element: <RequirePermission anyOf={['company.manage']} />,
            children: [
              { index: true, element: <CompanyProfilePage />, handle: h('Company Profile', 'Admin') },
            ],
          },
          {
            path: 'users',
            element: <RequirePermission anyOf={['users.manage']} />,
            children: [{ index: true, element: <UsersPage />, handle: h('Users', 'Admin') }],
          },
          {
            path: 'roles',
            element: <RequirePermission anyOf={['roles.manage']} />,
            children: [
              { index: true, element: <RolesPage />, handle: h('Roles & Permissions', 'Admin') },
            ],
          },
          {
            path: 'branches',
            element: <RequirePermission anyOf={['branches.read']} />,
            children: [{ index: true, element: <BranchesPage />, handle: h('Branches', 'Admin') }],
          },
          {
            path: 'audit-log',
            element: <RequirePermission anyOf={['audit.read']} />,
            children: [{ index: true, element: <AuditLogPage />, handle: h('Audit Log', 'Admin') }],
          },
        ],
      },
      ...SAMPLE_PAGES.map((page) => ({
        path: page.path.slice(1),
        element: <RequirePermission anyOf={page.anyOf} />,
        children: [
          {
            index: true,
            element: <SampleRoute id={page.id} />,
            handle: h(page.title, page.section),
          },
        ],
      })),
      { path: 'account', element: <AccountPage />, handle: h('Account settings') },
      { path: '*', element: <NotFoundPage />, handle: h('Page not found') },
    ],
  },
];

export const router = createBrowserRouter(routes);
