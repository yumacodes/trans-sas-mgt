import { z } from 'zod';
import type { Permission } from '../permissions';
import { isoDate, uuid } from './common';

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

export const reportQuerySchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  branchId: uuid.optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export type ReportCellFormat = 'text' | 'money' | 'quantity' | 'date' | 'count' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  format: ReportCellFormat;
  /** Column holding the currency for a money cell. */
  currencyKey?: string;
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
