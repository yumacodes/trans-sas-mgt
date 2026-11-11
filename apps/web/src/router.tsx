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
const ProformaPage = lazy(() => import('@/pages/proforma/ProformaPage'));
const TendersPage = lazy(() => import('@/pages/tenders/TendersPage'));
const SalesPage = lazy(() => import('@/pages/sales/SalesPage'));
const WaybillsPage = lazy(() => import('@/pages/waybills/WaybillsPage'));
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage'));
const PurchasesPage = lazy(() => import('@/pages/purchases/PurchasesPage'));
const SuppliersPage = lazy(() => import('@/pages/purchases/SuppliersPage'));
const AcceptancePage = lazy(() => import('@/pages/acceptance/AcceptancePage'));
const GeneralExpensesPage = lazy(() =>
  import('@/pages/expenses/ExpensesPage').then((m) => ({ default: m.GeneralExpensesPage })),
);
const TenderInPage = lazy(() => import('@/pages/expenses/ExpensesPage').then((m) => ({ default: m.TenderInPage })));
const TenderOutPage = lazy(() => import('@/pages/expenses/ExpensesPage').then((m) => ({ default: m.TenderOutPage })));
const StockItemsPage = lazy(() => import('@/pages/stock/StockItemsPage'));
const CommunicationPage = lazy(() => import('@/pages/communication/CommunicationPage'));
const StockBalancesPage = lazy(() => import('@/pages/stock/StockBalancesPage'));
const CompanyProfilePage = lazy(() => import('@/pages/admin/CompanyProfilePage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const RolesPage = lazy(() => import('@/pages/admin/RolesPage'));
const BranchesPage = lazy(() => import('@/pages/admin/BranchesPage'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));

const ReportPage = lazy(() => import('@/pages/reports/ReportPage'));

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
        path: 'proforma',
        element: <RequirePermission anyOf={['proformas.read']} />,
        children: [{ index: true, element: <ProformaPage />, handle: h('Proforma', 'Overview') }],
      },
      { path: 'registered-clients', element: <Navigate to="/clients" replace /> },
      {
        path: 'sales',
        element: <RequirePermission anyOf={['sales.read']} />,
        children: [{ index: true, element: <SalesPage />, handle: h('Sales', 'Overview') }],
      },
      {
        path: 'waybills',
        element: <RequirePermission anyOf={['waybills.read']} />,
        children: [{ index: true, element: <WaybillsPage />, handle: h('Way Bill', 'Overview') }],
      },
      {
        path: 'purchases',
        element: <RequirePermission anyOf={['purchases.read']} />,
        children: [{ index: true, element: <PurchasesPage />, handle: h('Purchase', 'Stock Management') }],
      },
      {
        path: 'suppliers',
        element: <RequirePermission anyOf={['purchases.read']} />,
        children: [{ index: true, element: <SuppliersPage />, handle: h('Suppliers', 'Stock Management') }],
      },
      {
        path: 'payments',
        element: <RequirePermission anyOf={['payments.read']} />,
        children: [{ index: true, element: <PaymentsPage />, handle: h('Payment', 'Finance') }],
      },
      {
        path: 'tender-schedule',
        element: <RequirePermission anyOf={['tenders.read']} />,
        children: [{ index: true, element: <TendersPage />, handle: h('Tender Price Schedule', 'Overview') }],
      },
      {
        path: 'acceptance-letters',
        element: <RequirePermission anyOf={['acceptance.read']} />,
        children: [{ index: true, element: <AcceptancePage />, handle: h('Acceptance Letter', 'Overview') }],
      },
      {
        path: 'expenses',
        element: <RequirePermission anyOf={['expenses.read']} />,
        children: [
          { index: true, element: <Navigate to="/expenses/general" replace /> },
          { path: 'general', element: <GeneralExpensesPage />, handle: h('General Expenses', 'Expenses') },
          { path: 'tender-in', element: <TenderInPage />, handle: h('Tender-In', 'Expenses') },
          { path: 'tender-out', element: <TenderOutPage />, handle: h('Tender-Out', 'Expenses') },
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
      {
        path: 'reports/:key',
        element: <RequirePermission anyOf={['reports.view', 'reports.financial']} />,
        children: [{ index: true, element: <ReportPage />, handle: h('Report', 'Reports') }],
      },
      { path: 'account', element: <AccountPage />, handle: h('Account settings') },
      { path: '*', element: <NotFoundPage />, handle: h('Page not found') },
    ],
  },
];

export const router = createBrowserRouter(routes);
