/**
 * Permission catalogue. This is the single source of truth for permission keys:
 * the API seeds them into the database and checks them on every route, and the
 * web app uses them to decide which navigation items and actions to show.
 *
 * Adding a key here and re-running the seed makes it available to administrators.
 * Existing role assignments are never overwritten by the seed.
 */
export const PERMISSION_GROUPS = {
  dashboard: { label: 'Dashboard' },
  clients: { label: 'Clients' },
  registrations: { label: 'Registered Clients' },
  stock: { label: 'Stock & Inventory' },
  purchases: { label: 'Purchases' },
  sales: { label: 'Sales & Documents' },
  finance: { label: 'Finance' },
  reports: { label: 'Reports' },
  communication: { label: 'Communication' },
  admin: { label: 'Administration' },
} as const;

export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

interface PermissionDef {
  group: PermissionGroup;
  description: string;
}

export const PERMISSION_DEFINITIONS = {
  'dashboard.view': { group: 'dashboard', description: 'View the business dashboard' },

  'clients.read': { group: 'clients', description: 'View clients' },
  'clients.create': { group: 'clients', description: 'Create clients' },
  'clients.update': { group: 'clients', description: 'Edit clients' },
  'clients.archive': { group: 'clients', description: 'Archive and restore clients' },

  'registrations.read': { group: 'registrations', description: 'View client registrations' },
  'registrations.manage': {
    group: 'registrations',
    description: 'Create and update client registrations',
  },

  'stock_items.read': { group: 'stock', description: 'View the stock item catalogue' },
  'stock_items.create': { group: 'stock', description: 'Create stock items and categories' },
  'stock_items.update': { group: 'stock', description: 'Edit stock items and categories' },
  'stock_items.view_cost': { group: 'stock', description: 'View purchase costs of stock items' },
  'inventory.read': { group: 'stock', description: 'View stock balances and movements' },
  'inventory.adjust': { group: 'stock', description: 'Record stock adjustments' },
  'inventory.transfer': { group: 'stock', description: 'Transfer stock between branches' },

  'purchases.read': { group: 'purchases', description: 'View purchases and suppliers' },
  'purchases.manage': { group: 'purchases', description: 'Create and edit purchases and suppliers' },
  'purchases.receive': { group: 'purchases', description: 'Receive purchased goods into stock' },

  'proformas.read': { group: 'sales', description: 'View proforma documents' },
  'proformas.manage': { group: 'sales', description: 'Create and edit proforma documents' },
  'tenders.read': { group: 'sales', description: 'View tenders and price schedules' },
  'tenders.manage': { group: 'sales', description: 'Create and edit tenders and price schedules' },
  'sales.read': { group: 'sales', description: 'View sales' },
  'sales.manage': { group: 'sales', description: 'Create and edit sales' },
  'sales.cancel': { group: 'sales', description: 'Cancel or correct issued sales' },
  'waybills.read': { group: 'sales', description: 'View waybills' },
  'waybills.manage': { group: 'sales', description: 'Create and update waybills' },
  'acceptance.read': { group: 'sales', description: 'View acceptance letters' },
  'acceptance.manage': { group: 'sales', description: 'Create and update acceptance letters' },

  'payments.read': { group: 'finance', description: 'View payments' },
  'payments.record': { group: 'finance', description: 'Record payments' },
  'payments.reverse': { group: 'finance', description: 'Reverse or correct payments' },
  'expenses.read': { group: 'finance', description: 'View expenses and tender transactions' },
  'expenses.manage': { group: 'finance', description: 'Record expenses and tender transactions' },
  'expenses.approve': { group: 'finance', description: 'Approve expenses' },

  'messages.read': { group: 'communication', description: 'View messages sent to clients and staff' },
  'messages.send': { group: 'communication', description: 'Send messages to clients and staff' },

  'reports.view': { group: 'reports', description: 'View operational reports' },
  'reports.financial': { group: 'reports', description: 'View financial reports' },

  'company.manage': { group: 'admin', description: 'Manage the company profile and settings' },
  'branches.read': { group: 'admin', description: 'View branches' },
  'branches.manage': { group: 'admin', description: 'Create and edit branches' },
  'branches.all_access': {
    group: 'admin',
    description: 'Access records of every branch (otherwise limited to assigned branches)',
  },
  'users.manage': { group: 'admin', description: 'Manage user accounts' },
  'roles.manage': { group: 'admin', description: 'Manage roles and their permissions' },
  'audit.read': { group: 'admin', description: 'View the audit log' },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSION_DEFINITIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSION_DEFINITIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSION_DEFINITIONS;
}

export const SYSTEM_ROLES = {
  admin: 'admin',
  accountant: 'accountant',
  support: 'support',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Conservative starting permissions. These are applied only when a role is first
 * created; administrators can change them afterwards from the Roles screen.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  SystemRole,
  { name: string; description: string; permissions: Permission[] }
> = {
  admin: {
    name: 'Admin',
    description: 'Full access to company-wide functions, users, roles and settings.',
    permissions: ALL_PERMISSIONS,
  },
  accountant: {
    name: 'Accountant',
    description: 'Financial records, payments, expenses and financial reporting.',
    permissions: [
      'dashboard.view',
      'clients.read',
      'registrations.read',
      'stock_items.read',
      'stock_items.view_cost',
      'inventory.read',
      'purchases.read',
      'proformas.read',
      'tenders.read',
      'sales.read',
      'waybills.read',
      'acceptance.read',
      'payments.read',
      'payments.record',
      'expenses.read',
      'expenses.manage',
      'reports.view',
      'reports.financial',
      'branches.read',
      'branches.all_access',
    ],
  },
  support: {
    name: 'Support',
    description: 'Client records and operational documentation.',
    permissions: [
      'dashboard.view',
      'clients.read',
      'clients.create',
      'clients.update',
      'registrations.read',
      'stock_items.read',
      'inventory.read',
      'proformas.read',
      'proformas.manage',
      'sales.read',
      'waybills.read',
      'waybills.manage',
      'acceptance.read',
      'acceptance.manage',
      'branches.read',
    ],
  },
};

/** Permission whose holders count as administrators for the last-admin guard. */
export const ADMIN_GUARD_PERMISSION: Permission = 'users.manage';
