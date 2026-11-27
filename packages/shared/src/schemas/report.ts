import { z } from 'zod';
import type { Permission } from '../permissions';
import { isoDate, uuid } from './common';
import { EXPENSE_STATUS_LABELS } from './expense';
import { PURCHASE_STATUS_LABELS } from './purchase';
import { PAYMENT_STATUS_LABELS, SALE_STATUS_LABELS } from './sale';
import { TENDER_STATUS_LABELS } from './tender';

/**
 * Reports are management reports built from the operational records in this system. They
 * are not a statutory accounting ledger. Amounts in different currencies are never added
 * together: every total is per currency.
 */

export const REPORT_KEYS = [
  'income-statement',
  'sales',
  'payments',
  'expenses',
  'tenders',
  'stock',
  'stock-movement',
  'low-stock',
  'purchases',
  'clients',
  'outstanding-balances',
  'branch-performance',
  'tax-summary',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_META: Record<ReportKey, { title: string; permission: Permission; usesDates: boolean }> = {
  'income-statement': { title: 'Income Statement', permission: 'reports.financial', usesDates: true },
  sales: { title: 'Sales Report', permission: 'reports.view', usesDates: true },
  payments: { title: 'Payment Report', permission: 'reports.financial', usesDates: true },
  expenses: { title: 'Expense Report', permission: 'reports.financial', usesDates: true },
  tenders: { title: 'Tender Report', permission: 'reports.view', usesDates: true },
  stock: { title: 'Stock Report', permission: 'reports.view', usesDates: false },
  'stock-movement': { title: 'Stock Movement Report', permission: 'reports.view', usesDates: true },
  'low-stock': { title: 'Low-Stock Report', permission: 'reports.view', usesDates: false },
  purchases: { title: 'Purchase Report', permission: 'reports.view', usesDates: true },
  clients: { title: 'Client Report', permission: 'reports.view', usesDates: true },
  'outstanding-balances': { title: 'Outstanding Balances', permission: 'reports.financial', usesDates: false },
  'branch-performance': { title: 'Branch Performance', permission: 'reports.view', usesDates: true },
  'tax-summary': { title: 'Tax Summary', permission: 'reports.financial', usesDates: true },
};

/** One sentence per report saying what it counts, shown under its title. */
export const REPORT_DESCRIPTIONS: Record<ReportKey, string> = {
  'income-statement':
    'A management report from operational data, not statutory accounts: revenue is confirmed sales excluding tax, less the cost of stock issued on them and approved general expenses.',
  sales: 'Sales by sale date with their tax, total, what has been paid and what is still owed; confirmed sales only unless you pick another status.',
  payments: 'Money received from customers by payment date; this is cash received, not sales made, and reversed payments are left out unless you pick them.',
  expenses: 'General expenses and Tender-In / Tender-Out transactions by date, approved ones unless you pick another status, totalled separately per type.',
  tenders: 'Tender price schedules by schedule date with their status and value; a schedule is not a sale, and only awarded schedules are totalled.',
  stock: 'Quantity on hand today per item and branch from the stock ledger, valued at weighted average cost where a cost was recorded.',
  'stock-movement': 'Every stock movement in the period (receipts, issues, transfers and adjustments), positive in and negative out.',
  'low-stock': 'Active items at or below their reorder level today at each branch that holds them.',
  purchases: 'Purchase orders by order date with how much of each has been received; cancelled orders are left out unless you pick them.',
  clients: 'Active clients with the number and value of their confirmed sales in the period and what they still owe on them.',
  'outstanding-balances': 'Confirmed sales with money still owing today, whatever their date, and how many days past due each one is.',
  'branch-performance': 'Per branch and currency: confirmed sales, customer payments received and approved general expenses in the period.',
  'tax-summary': 'Tax charged on confirmed sales and tax paid on ordered or received purchases, by document date, as the documents record it.',
};

export interface ReportStatusOption {
  value: string;
  label: string;
}

/**
 * Status filters for reports whose records have a lifecycle. `defaultValue` is used when no
 * status is given; when it is absent, no status means "all" (as described by `allLabel`).
 */
export const REPORT_STATUS_FILTERS: Partial<
  Record<ReportKey, { options: ReportStatusOption[]; defaultValue?: string; allLabel?: string }>
> = {
  sales: { options: Object.entries(SALE_STATUS_LABELS).map(([value, label]) => ({ value, label })), defaultValue: 'confirmed' },
  payments: { options: Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })), defaultValue: 'posted' },
  expenses: { options: Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => ({ value, label })), defaultValue: 'approved' },
  tenders: { options: Object.entries(TENDER_STATUS_LABELS).map(([value, label]) => ({ value, label })), allLabel: 'All statuses' },
  purchases: {
    options: Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
    allLabel: 'All except cancelled',
  },
};

export const reportQuerySchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  branchId: uuid.optional(),
  /** One of the report's REPORT_STATUS_FILTERS options; checked against the report on the server. */
  status: z.string().trim().max(40).optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/**
 * Where a cell links to. Either a record (`openKey` → `?open=<id>`) or a filtered list
 * (`filters` from row fields, `fixed` values, and `scoped` to add the report's own
 * dateFrom / dateTo / branchId). A row without the needed value is shown without a link.
 */
export interface ReportLink {
  /** List page, e.g. "/sales". */
  path?: string;
  /** Row field holding the list page path, for rows that point at different pages. */
  pathKey?: string;
  /** Row field holding the id of the record to open. */
  openKey?: string;
  /** URL filter name → row field. */
  filters?: Record<string, string>;
  /** URL filter name → fixed value. */
  fixed?: Record<string, string>;
  /** Carry the report's period and branch to the list as dateFrom, dateTo and branchId. */
  scoped?: boolean;
}

export type ReportCellFormat = 'text' | 'money' | 'quantity' | 'date' | 'count' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportCellFormat;
  /** Column holding the currency for a money cell. */
  currencyKey?: string;
  /** Drill-down from this cell to the underlying record or list. */
  link?: ReportLink;
}

export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

export interface ReportDto {
  key: ReportKey;
  title: string;
  /** What the figures mean and how they were calculated. */
  notes: string[];
  /** The filters the report was run with, in words. */
  criteria: string[];
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Total lines shown under the table, one per currency where amounts are involved. */
  totals: ReportRow[];
  generatedAt: string;
}
