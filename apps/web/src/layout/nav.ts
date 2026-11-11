import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  ClipboardCheck,
  FileSignature,
  FileText,
  Gavel,
  LayoutDashboard,
  MessagesSquare,
  Package,
  ShieldCheck,
  ShoppingBag,
  Factory,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { Permission } from '@tsm/shared';
import { samplePath } from '@/features/samples/registry';

export const NAV_GROUPS = [
  'Overview',
  'Records',
  'Communication',
  'Finance',
  'Expenses',
  'Stock Management',
  'Reports',
  'Administration',
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  to?: string;
  /** Visible when the user holds any of these. Omitted = visible to every signed-in user. */
  anyOf?: Permission[];
  /** Module not yet built: rendered as a non-interactive entry with a "Planned" badge. */
  planned?: boolean;
  /** Section heading this top-level item is listed under. */
  group?: NavGroup;
  /** Shows the number of open password-reset requests beside the label. */
  showsResetRequests?: boolean;
  children?: NavItem[];
}

/** Sidebar structure (CLAUDE.md §8). Server-side authorization is enforced independently. */
const ITEMS: NavItem[] = [
  { id: 'dashboard', group: 'Overview', label: 'Dashboard', icon: LayoutDashboard, to: '/', anyOf: ['dashboard.view'] },
  { id: 'proforma', to: '/proforma', group: 'Overview', label: 'Proforma', icon: FileText, anyOf: ['proformas.read'] },
  {
    id: 'tender-schedule', to: '/tender-schedule', group: 'Overview',
    label: 'Tender Price Schedule',
    icon: Gavel,
    anyOf: ['tenders.read'],
  },
  { id: 'sales', to: '/sales', group: 'Overview', label: 'Sales', icon: ShoppingCart, anyOf: ['sales.read'] },
  { id: 'waybill', to: '/waybills', group: 'Overview', label: 'Way Bill', icon: Truck, anyOf: ['waybills.read'] },
  {
    id: 'stock-items', group: 'Records',
    label: 'Stock Items',
    icon: Package,
    to: '/stock-items',
    anyOf: ['stock_items.read'],
  },
  { id: 'clients', group: 'Records', label: 'Clients', icon: Users, to: '/clients', anyOf: ['clients.read'] },
  {
    id: 'acceptance', to: '/acceptance-letters', group: 'Overview',
    label: 'Acceptance Letter',
    icon: FileSignature,
    anyOf: ['acceptance.read'],
  },
  {
    id: 'communication', group: 'Communication',
    label: 'Communication',
    icon: MessagesSquare,
    to: '/communication',
    anyOf: ['messages.read', 'messages.send'],
  },
  { id: 'payment', to: '/payments', group: 'Finance', label: 'Payment', icon: Banknote, anyOf: ['payments.read'] },
  { id: 'expenses-general', to: '/expenses/general', group: 'Expenses', label: 'General', icon: Wallet, anyOf: ['expenses.read'] },
  { id: 'tender-in', to: '/expenses/tender-in', group: 'Expenses', label: 'Tender-In', icon: ArrowDownToLine, anyOf: ['expenses.read'] },
  { id: 'tender-out', to: '/expenses/tender-out', group: 'Expenses', label: 'Tender-Out', icon: ArrowUpFromLine, anyOf: ['expenses.read'] },
  { id: 'stock', group: 'Stock Management', label: 'Stock', icon: Boxes, to: '/stock', anyOf: ['inventory.read'] },
  { id: 'purchase', to: '/purchases', group: 'Stock Management', label: 'Purchase', icon: ShoppingBag, anyOf: ['purchases.read'] },
  { id: 'suppliers', to: '/suppliers', group: 'Stock Management', label: 'Suppliers', icon: Factory, anyOf: ['purchases.read'] },
  { id: 'r-income', group: 'Reports', label: 'Income Statement', icon: BarChart3, to: samplePath('r-income'), anyOf: ['reports.financial'] },
  { id: 'r-sales', group: 'Reports', label: 'Sales Report', icon: BarChart3, to: samplePath('r-sales'), anyOf: ['reports.view'] },
  { id: 'r-payment', group: 'Reports', label: 'Payment Report', icon: BarChart3, to: samplePath('r-payment'), anyOf: ['reports.financial'] },
  { id: 'r-expense', group: 'Reports', label: 'Expense Report', icon: BarChart3, to: samplePath('r-expense'), anyOf: ['reports.financial'] },
  { id: 'r-tender', group: 'Reports', label: 'Tender Report', icon: BarChart3, to: samplePath('r-tender'), anyOf: ['reports.view'] },
  { id: 'r-stock', group: 'Reports', label: 'Stock Report', icon: BarChart3, to: samplePath('r-stock'), anyOf: ['reports.view'] },
  { id: 'r-movement', group: 'Reports', label: 'Stock Movement Report', icon: BarChart3, to: samplePath('r-movement'), anyOf: ['reports.view'] },
  { id: 'r-low-stock', group: 'Reports', label: 'Low-Stock Report', icon: BarChart3, to: samplePath('r-low-stock'), anyOf: ['reports.view'] },
  { id: 'r-purchase', group: 'Reports', label: 'Purchase Report', icon: BarChart3, to: samplePath('r-purchase'), anyOf: ['reports.view'] },
  { id: 'r-clients', group: 'Reports', label: 'Client Report', icon: BarChart3, to: samplePath('r-clients'), anyOf: ['reports.view'] },
  { id: 'r-outstanding', group: 'Reports', label: 'Outstanding Balances', icon: BarChart3, to: samplePath('r-outstanding'), anyOf: ['reports.financial'] },
  { id: 'r-branch', group: 'Reports', label: 'Branch Performance', icon: BarChart3, to: samplePath('r-branch'), anyOf: ['reports.view'] },
  {
    id: 'admin', group: 'Administration',
    label: 'Admin',
    icon: ShieldCheck,
    anyOf: ['company.manage', 'users.manage', 'roles.manage', 'branches.read', 'audit.read'],
    children: [
      {
        id: 'company',
        label: 'Company Profile',
        icon: Building2,
        to: '/admin/company',
        anyOf: ['company.manage'],
      },
      { id: 'users', label: 'Users', to: '/admin/users', anyOf: ['users.manage'], showsResetRequests: true },
      {
        id: 'roles',
        label: 'Roles & Permissions',
        to: '/admin/roles',
        anyOf: ['roles.manage'],
      },
      { id: 'branches', label: 'Branches', to: '/admin/branches', anyOf: ['branches.read'] },
      { id: 'audit', label: 'Audit Log', icon: ClipboardCheck, to: '/admin/audit-log', anyOf: ['audit.read'] },
    ],
  },
];


/** Top-level entries in section order (stable within a section). */
export const NAV: NavItem[] = [...ITEMS].sort(
  (a, b) => (a.group ? NAV_GROUPS.indexOf(a.group) : -1) - (b.group ? NAV_GROUPS.indexOf(b.group) : -1),
);

/** Removes items the user may not see; drops groups left without visible children. */
export function filterNav(items: NavItem[], canAny: (...p: Permission[]) => boolean): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.anyOf && !canAny(...item.anyOf)) continue;
    if (item.children) {
      const children = filterNav(item.children, canAny);
      if (children.length === 0) continue;
      out.push({ ...item, children });
    } else {
      out.push(item);
    }
  }
  return out;
}
