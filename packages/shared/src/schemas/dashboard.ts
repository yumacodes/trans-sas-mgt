import type { AuditEntryDto } from './user';

/**
 * Dashboard figures. Every value is computed from database records at request time;
 * fields the requester is not permitted to see are null rather than zero.
 */
export interface DashboardSummaryDto {
  /** Clients with status "active". */
  activeClients: number | null;
  /** Distinct clients holding a registration whose status is "active". */
  registeredClients: number | null;
  /** Stock items flagged active in the catalogue. */
  activeStockItems: number | null;
  /** Active items whose on-hand quantity (visible branches) is at or below the reorder level. */
  lowStockItems: number | null;
  /** Active branches. */
  activeBranches: number | null;
  /** Proformas in draft or issued, awaiting the customer's answer. */
  openProformas: number | null;
  /** Price schedules in draft or submitted, awaiting an outcome. */
  openTenders: number | null;
  /** Expense and tender transactions awaiting approval. */
  pendingExpenses: number | null;
  /** Latest audit events; only returned to holders of audit.read. */
  recentActivity: AuditEntryDto[] | null;
}

export const DASHBOARD_RANGES = ['month', 'quarter', 'year'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/** A money figure for the current period and the one before it, of the same length. */
export interface PeriodFigure {
  value: string;
  previous: string;
}

/**
 * The charted dashboard, built from real records. Money is in the company's default
 * currency only; records in other currencies are listed in `otherCurrencies`, never
 * converted or added in.
 */
export interface DashboardOverviewDto {
  currency: string;
  otherCurrencies: string[];
  range: DashboardRange;
  /** Current period, start date to today, and the matching previous period. */
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  /** Confirmed sales including tax, by sale date. */
  sales: PeriodFigure | null;
  /** Posted customer payments, by payment date. */
  payments: PeriodFigure | null;
  /** What confirmed sales still owe today, and how many of them are past their due date. */
  outstanding: { value: string; overdueCount: number } | null;
  /** The last twelve months, oldest first: revenue is confirmed sales excluding tax. */
  monthly: { month: string; revenue: string; sales: string; payments: string }[] | null;
  /** Revenue for the twelve months before those. */
  priorYearRevenue: string | null;
  /** Revenue over the last twelve months by stock category, and the twelve before. */
  segments: { label: string; revenue: string; previous: string }[] | null;
  /** Active catalogue items per category, and how many are at or below reorder level here. */
  inventory: { category: string; tracked: number; below: number }[] | null;
  /** Dated things coming up in the next 14 days, or already overdue. */
  upcoming: { date: string; kind: 'tender' | 'due' | 'delivery'; title: string; detail: string; link: string }[];
  activity: AuditEntryDto[] | null;
}
