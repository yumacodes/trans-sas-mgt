import type { QueryClient } from '@tanstack/react-query';
import type { Permission } from '@tsm/shared';
import { request } from './api';
import { qk } from './queryKeys';

interface RouteWarmup {
  /** Loads the page's code (same dynamic import the router uses, so the chunk is shared). */
  chunk: () => Promise<unknown>;
  /** First-page list the page requests on arrival, with its default sort. */
  list?: { key: readonly unknown[]; path: string; sort?: string; extra?: Record<string, string>; permission: Permission };
}

const expenses = () => import('@/pages/expenses/ExpensesPage');
const report = () => import('@/pages/reports/ReportPage');

const ROUTES: Record<string, RouteWarmup> = {
  '/': { chunk: () => import('@/pages/DashboardPage') },
  '/clients': { chunk: () => import('@/pages/clients/ClientsPage'), list: { key: qk.clients, path: '/clients', sort: 'name:asc', permission: 'clients.read' } },
  '/proforma': { chunk: () => import('@/pages/proforma/ProformaPage'), list: { key: qk.proformas, path: '/proformas', sort: 'issueDate:desc', permission: 'proformas.read' } },
  '/tender-schedule': { chunk: () => import('@/pages/tenders/TendersPage'), list: { key: qk.tenders, path: '/tenders', sort: 'scheduleDate:desc', permission: 'tenders.read' } },
  '/sales': { chunk: () => import('@/pages/sales/SalesPage'), list: { key: qk.sales, path: '/sales', sort: 'saleDate:desc', permission: 'sales.read' } },
  '/waybills': { chunk: () => import('@/pages/waybills/WaybillsPage'), list: { key: qk.waybills, path: '/waybills', sort: 'deliveryDate:desc', permission: 'waybills.read' } },
  '/payments': { chunk: () => import('@/pages/payments/PaymentsPage'), list: { key: qk.payments, path: '/payments', sort: 'paymentDate:desc', permission: 'payments.read' } },
  '/purchases': { chunk: () => import('@/pages/purchases/PurchasesPage'), list: { key: qk.purchases, path: '/purchases', sort: 'purchaseDate:desc', permission: 'purchases.read' } },
  '/suppliers': { chunk: () => import('@/pages/purchases/SuppliersPage'), list: { key: qk.suppliers, path: '/suppliers', sort: 'name:asc', permission: 'purchases.read' } },
  '/acceptance-letters': { chunk: () => import('@/pages/acceptance/AcceptancePage'), list: { key: qk.acceptanceLetters, path: '/acceptance-letters', sort: 'letterDate:desc', permission: 'acceptance.read' } },
  '/expenses/general': { chunk: expenses, list: { key: [...qk.expenses, 'general'], path: '/expenses', sort: 'transactionDate:desc', extra: { kind: 'general' }, permission: 'expenses.read' } },
  '/expenses/tender-in': { chunk: expenses, list: { key: [...qk.expenses, 'tender_in'], path: '/expenses', sort: 'transactionDate:desc', extra: { kind: 'tender_in' }, permission: 'expenses.read' } },
  '/expenses/tender-out': { chunk: expenses, list: { key: [...qk.expenses, 'tender_out'], path: '/expenses', sort: 'transactionDate:desc', extra: { kind: 'tender_out' }, permission: 'expenses.read' } },
  '/stock-items': { chunk: () => import('@/pages/stock/StockItemsPage'), list: { key: qk.stockItems, path: '/stock-items', sort: 'name:asc', permission: 'stock_items.read' } },
  '/stock': { chunk: () => import('@/pages/stock/StockBalancesPage'), list: { key: qk.stockBalances, path: '/stock-balances', permission: 'inventory.read' } },
  '/communication': { chunk: () => import('@/pages/communication/CommunicationPage'), list: { key: qk.messages, path: '/messages', sort: 'createdAt:desc', permission: 'messages.read' } },
  '/admin/company': { chunk: () => import('@/pages/admin/CompanyProfilePage') },
  '/admin/users': { chunk: () => import('@/pages/admin/UsersPage'), list: { key: qk.users, path: '/users', sort: 'fullName:asc', permission: 'users.manage' } },
  '/admin/roles': { chunk: () => import('@/pages/admin/RolesPage') },
  '/admin/branches': { chunk: () => import('@/pages/admin/BranchesPage'), list: { key: qk.branches, path: '/branches', sort: 'code:asc', permission: 'branches.read' } },
  '/admin/audit-log': { chunk: () => import('@/pages/admin/AuditLogPage'), list: { key: qk.auditLogs, path: '/audit-logs', permission: 'audit.read' } },
};

/** Warm one page: download its code and fetch the first page of its table. Never throws. */
export function warmRoute(path: string, queryClient: QueryClient, can: (permission: Permission) => boolean) {
  const route = path.startsWith('/reports/') ? { chunk: report } : ROUTES[path];
  if (!route) return;
  void route.chunk().catch(() => undefined);
  const list = 'list' in route ? route.list : undefined;
  if (!list || !can(list.permission)) return;
  const query = { page: 1, pageSize: 25, sort: list.sort, q: undefined, ...list.extra };
  void queryClient
    .prefetchQuery({
      queryKey: [...list.key, 'list', query],
      queryFn: ({ signal }) => request('GET', list.path, { query, signal }),
    })
    .catch(() => undefined);
}

/** After sign-in, warm every page the user can open, one at a time, when the browser is idle. */
export function warmAllRoutes(paths: string[], queryClient: QueryClient, can: (permission: Permission) => boolean) {
  const queue = [...paths];
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 300);
  const next = () => {
    const path = queue.shift();
    if (!path) return;
    warmRoute(path, queryClient, can);
    idle(next);
  };
  idle(next);
}
