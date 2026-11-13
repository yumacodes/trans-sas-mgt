import type { DashboardOverviewDto } from '@tsm/shared';

/**
 * Shapes the dashboard draws, built from the real overview the API returns. Nothing here
 * is sample data: an empty business shows zeros and empty charts.
 */

export type RangeKey = 'month' | 'quarter' | 'year';
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

const TO_DATE: Record<RangeKey, string> = { month: 'MTD', quarter: 'QTD', year: 'YTD' };

/* ---------------------------------------------------------------- KPI cards */

export type KpiId = 'sales' | 'payments' | 'outstanding' | 'stock';
export interface KpiDef {
  id: KpiId;
  label: string;
  /** Whole currency units, or a percentage (0-100) when `unit` is 'percent'. */
  value: number;
  unit: 'money' | 'percent';
  /** Change versus the previous period of the same length, in percent. */
  change: number | null;
  /** Whether an increase is good news. Outstanding balances rising is not. */
  upIsGood: boolean;
  caption: string;
  trend: number[];
  tone: string;
  to?: string;
}

const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

export function toKpis(o: DashboardOverviewDto, range: RangeKey): KpiDef[] {
  const kpis: KpiDef[] = [];
  const recent = (key: 'sales' | 'payments') => (o.monthly ?? []).slice(-6).map((m) => Number(m[key]));
  if (o.sales) {
    const now = Number(o.sales.value);
    const before = Number(o.sales.previous);
    kpis.push({
      id: 'sales',
      label: `Sales value · ${TO_DATE[range]}`,
      value: now,
      unit: 'money',
      change: change(now, before),
      upIsGood: true,
      caption: before > 0 ? 'vs the same days last period' : 'Confirmed sales, including tax',
      trend: recent('sales'),
      tone: 'var(--color-chart-navy)',
      to: '/sales?status=confirmed',
    });
  }
  if (o.payments) {
    const now = Number(o.payments.value);
    const before = Number(o.payments.previous);
    kpis.push({
      id: 'payments',
      label: 'Payments received',
      value: now,
      unit: 'money',
      change: change(now, before),
      upIsGood: true,
      caption: before > 0 ? 'vs the same days last period' : 'Money received from customers',
      trend: recent('payments'),
      tone: 'var(--color-info)',
      to: '/payments',
    });
  }
  if (o.outstanding) {
    kpis.push({
      id: 'outstanding',
      label: 'Outstanding balances',
      value: Number(o.outstanding.value),
      unit: 'money',
      change: null,
      upIsGood: false,
      caption: o.outstanding.overdueCount > 0 ? `${o.outstanding.overdueCount} sale(s) overdue` : 'Nothing overdue',
      trend: [],
      tone: '#5b4bd1',
      to: '/reports/outstanding-balances',
    });
  }
  if (o.inventory) {
    const { below, availabilityPct } = inventoryTotals(toInventory(o));
    kpis.push({
      id: 'stock',
      label: 'Stock availability',
      value: availabilityPct,
      unit: 'percent',
      change: null,
      upIsGood: true,
      caption: `${below} item(s) at or below reorder level`,
      trend: [],
      tone: 'var(--color-chart-teal)',
      to: '/stock-items?lowStock=true',
    });
  }
  return kpis;
}

/* ------------------------------------------------------------------ inventory */

export interface InventoryCategory {
  id: string;
  label: string;
  tracked: number;
  belowReorder: number;
}

export function toInventory(o: DashboardOverviewDto): InventoryCategory[] {
  return (o.inventory ?? []).map((c) => ({ id: c.category, label: c.category, tracked: c.tracked, belowReorder: c.below }));
}

/** A category needs attention once a tenth or more of its items are at or below reorder. */
export const ATTENTION_RATIO = 0.1;

export function inventoryTotals(categories: InventoryCategory[]) {
  const tracked = categories.reduce((s, c) => s + c.tracked, 0);
  const below = categories.reduce((s, c) => s + c.belowReorder, 0);
  return { tracked, below, availabilityPct: tracked === 0 ? 0 : ((tracked - below) / tracked) * 100 };
}

export function categoryHealth(c: InventoryCategory) {
  const inStockPct = c.tracked === 0 ? 0 : ((c.tracked - c.belowReorder) / c.tracked) * 100;
  return { inStockPct, attention: c.tracked > 0 && c.belowReorder / c.tracked >= ATTENTION_RATIO };
}

/* -------------------------------------------------------------------- revenue */

export interface MonthPoint {
  /** Short axis label, e.g. "Nov". */
  label: string;
  /** Long label for tooltips, e.g. "November 2026". */
  full: string;
  /** Revenue (confirmed sales excluding tax) in thousands. */
  actual: number;
  /** Payments received in thousands. */
  payments: number;
}

export function toMonthly(o: DashboardOverviewDto): MonthPoint[] {
  return (o.monthly ?? []).map((m) => {
    const d = new Date(`${m.month}-01T00:00:00Z`);
    return {
      label: d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
      full: d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      actual: Number(m.revenue) / 1000,
      payments: Number(m.payments) / 1000,
    };
  });
}

export interface ChartWindow {
  points: MonthPoint[];
  span: string;
  grouped: boolean;
}

/** Month: the last six months. Quarter: all twelve. Year: twelve rolled into four quarters. */
export function getChartWindow(range: RangeKey, data: MonthPoint[]): ChartWindow {
  if (range === 'month') return { points: data.slice(-6), span: '6 MO', grouped: false };
  if (range === 'quarter') return { points: data, span: '12 MO', grouped: false };
  const points: MonthPoint[] = [];
  for (let i = 0; i < data.length; i += 3) {
    const chunk = data.slice(i, i + 3);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;
    points.push({
      label: `Q${points.length + 1}`,
      full: `${first.label} to ${last.label}`,
      actual: chunk.reduce((s, m) => s + m.actual, 0),
      payments: chunk.reduce((s, m) => s + m.payments, 0),
    });
  }
  return { points, span: '12 MO', grouped: true };
}

export interface RevenueSummary {
  actualTotal: number;
  paymentsTotal: number;
  best: { label: string; value: number } | null;
  /** Change against the twelve months before; only for a twelve-month window. */
  yoyPct: number | null;
}

export function summariseRevenue(range: RangeKey, data: MonthPoint[], priorYearK: number | null): RevenueSummary {
  const months = range === 'month' ? data.slice(-6) : data;
  const actualTotal = months.reduce((s, m) => s + m.actual, 0);
  const best = months.reduce<RevenueSummary['best']>(
    (b, m) => (m.actual > 0 && (b === null || m.actual > b.value) ? { label: m.label, value: m.actual } : b),
    null,
  );
  return {
    actualTotal,
    paymentsTotal: months.reduce((s, m) => s + m.payments, 0),
    best,
    yoyPct: range !== 'month' && priorYearK ? ((actualTotal - priorYearK) / priorYearK) * 100 : null,
  };
}
