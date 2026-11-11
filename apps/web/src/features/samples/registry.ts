import type { Permission } from '@tsm/shared';

/**
 * Pages for modules that are not built yet. They render sample data from `sampleData.ts`
 * so the layout can be reviewed. Paths and permissions are kept here (and nowhere else) so
 * the sidebar and router stay in step.
 */
export interface SamplePageMeta {
  id: string;
  path: string;
  title: string;
  section?: string;
  anyOf: Permission[];
}

export const SAMPLE_PAGES: SamplePageMeta[] = [
  { id: 'proforma', path: '/proforma', title: 'Proforma', anyOf: ['proformas.read'] },
  { id: 'purchase', path: '/purchases', title: 'Purchase', section: 'Stock Management', anyOf: ['purchases.read'] },
  { id: 'r-income', path: '/reports/income-statement', title: 'Income Statement', section: 'Reports', anyOf: ['reports.financial'] },
  { id: 'r-sales', path: '/reports/sales', title: 'Sales Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-payment', path: '/reports/payments', title: 'Payment Report', section: 'Reports', anyOf: ['reports.financial'] },
  { id: 'r-expense', path: '/reports/expenses', title: 'Expense Report', section: 'Reports', anyOf: ['reports.financial'] },
  { id: 'r-tender', path: '/reports/tenders', title: 'Tender Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-stock', path: '/reports/stock', title: 'Stock Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-movement', path: '/reports/stock-movement', title: 'Stock Movement Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-low-stock', path: '/reports/low-stock', title: 'Low-Stock Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-purchase', path: '/reports/purchases', title: 'Purchase Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-clients', path: '/reports/clients', title: 'Client Report', section: 'Reports', anyOf: ['reports.view'] },
  { id: 'r-outstanding', path: '/reports/outstanding-balances', title: 'Outstanding Balances', section: 'Reports', anyOf: ['reports.financial'] },
  { id: 'r-branch', path: '/reports/branch-performance', title: 'Branch Performance', section: 'Reports', anyOf: ['reports.view'] },
];

export const samplePath = (id: string) => {
  const page = SAMPLE_PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`Unknown sample page ${id}`);
  return page.path;
};
