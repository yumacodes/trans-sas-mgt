/**
 * SAMPLE DATA for the dashboard preview. Nothing here comes from the database.
 *
 * Every figure is deterministic and, where one number depends on another, it is derived
 * from the shared collections below rather than typed twice:
 *  - the 12-month revenue total, forecast total, attainment and best month come from
 *    `MONTHLY`;
 *  - stock availability = (tracked items - items below reorder level) / tracked items,
 *    computed from `INVENTORY`;
 *  - the schedule total and free time come from `SCHEDULE`.
 *
 * Differences that are intentional: "sales value" (invoiced) and "recognised revenue" are
 * different measures, and the four segment figures are rounded to GH₵ 0.1M, so their sum
 * (9.8M) is close to, but not identical with, the 12-month revenue (9.84M).
 *
 * To go live, replace these collections with the response of an API call that returns the
 * same shapes and set VITE_DASHBOARD_DEMO=false to show the live dashboard instead.
 */

export const DEMO_CURRENCY = 'GHS';

export type RangeKey = 'month' | 'quarter' | 'year';
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

/* ---------------------------------------------------------------- KPI cards */

export type KpiId = 'sales' | 'payments' | 'outstanding' | 'stock';
export interface KpiDef {
  id: KpiId;
  label: string;
  /** Whole cedis, or a percentage (0-100) when `unit` is 'percent'. */
  value: number;
  unit: 'money' | 'percent';
  /** Change versus the previous period of the same length, in percent. */
  change: number | null;
  /** Whether an increase is good news. Outstanding balances rising is not. */
  upIsGood: boolean;
  caption: string;
  trend: number[];
  tone: string;
  /** Existing module this figure belongs to, when there is one. */
  to?: string;
}

const KPI_BY_RANGE: Record<RangeKey, KpiDef[]> = {
  month: [
    { id: 'sales', label: 'Sales value · MTD', value: 0, unit: 'money', change: null, upIsGood: true, caption: 'No data yet', trend: [], tone: 'var(--color-chart-navy)' },
    { id: 'payments', label: 'Payments received', value: 0, unit: 'money', change: null, upIsGood: true, caption: 'No data yet', trend: [], tone: 'var(--color-info)' },
    { id: 'outstanding', label: 'Outstanding balances', value: 0, unit: 'money', change: null, upIsGood: false, caption: 'No data yet', trend: [], tone: '#5b4bd1' },
    { id: 'stock', label: 'Stock availability', value: 0, unit: 'percent', change: null, upIsGood: true, caption: '', trend: [], tone: 'var(--color-chart-teal)', to: '/stock' },
  ],
  quarter: [
    { id: 'sales', label: 'Sales value · QTD', value: 0, unit: 'money', change: null, upIsGood: true, caption: 'No data yet', trend: [], tone: 'var(--color-chart-navy)' },
    { id: 'payments', label: 'Payments received', value: 0, unit: 'money', change: null, upIsGood: true, caption: 'No data yet', trend: [], tone: 'var(--color-info)' },
    { id: 'outstanding', label: 'Outstanding balances', value: 0, unit: 'money', change: null, upIsGood: false, caption: 'No data yet', trend: [], tone: '#5b4bd1' },
    { id: 'stock', label: 'Stock availability', value: 0, unit: 'percent', change: null, upIsGood: true, caption: '', trend: [], tone: 'var(--color-chart-teal)', to: '/stock' },
  ],
  year: [
    { id: 'sales', label: 'Sales value · YTD', value: 0, unit: 'money', change: null, upIsGood: true, caption: 'No data yet', trend: [], tone: 'var(--color-chart-navy)' },
    { id: 'payments', label: 'Payments received', value: 0, unit: 'money', change: null, upIsGood: true, caption: 'No data yet', trend: [], tone: 'var(--color-info)' },
    { id: 'outstanding', label: 'Outstanding balances', value: 0, unit: 'money', change: null, upIsGood: false, caption: 'No data yet', trend: [], tone: '#5b4bd1' },
    { id: 'stock', label: 'Stock availability', value: 0, unit: 'percent', change: null, upIsGood: true, caption: '', trend: [], tone: 'var(--color-chart-teal)', to: '/stock' },
  ],
};

/* ------------------------------------------------------------------ inventory */

export interface InventoryCategory {
  id: string;
  label: string;
  tracked: number;
  belowReorder: number;
}

/** Tracked catalogue items per category and how many sit at or below their reorder level. */
export const INVENTORY: InventoryCategory[] = [];

/** A category needs attention once a tenth or more of its items are at or below reorder. */
export const ATTENTION_RATIO = 0.1;

export function inventoryTotals(categories: InventoryCategory[] = INVENTORY) {
  const tracked = categories.reduce((s, c) => s + c.tracked, 0);
  const below = categories.reduce((s, c) => s + c.belowReorder, 0);
  return { tracked, below, availabilityPct: tracked === 0 ? 0 : ((tracked - below) / tracked) * 100 };
}

export function categoryHealth(c: InventoryCategory) {
  const inStockPct = c.tracked === 0 ? 0 : ((c.tracked - c.belowReorder) / c.tracked) * 100;
  return { inStockPct, attention: c.tracked > 0 && c.belowReorder / c.tracked >= ATTENTION_RATIO };
}

export function getKpis(range: RangeKey): KpiDef[] {
  const { below, availabilityPct } = inventoryTotals();
  return KPI_BY_RANGE[range].map((k) =>
    k.id === 'stock'
      ? { ...k, value: availabilityPct, caption: `${below} items below reorder level` }
      : k,
  );
}

/* -------------------------------------------------------------------- revenue */

export interface MonthPoint {
  /** Short axis label, e.g. "Nov". */
  label: string;
  /** Long label for tooltips, e.g. "November 2025". */
  full: string;
  /** Recognised revenue in thousands of cedis; null = not yet reported. */
  actual: number | null;
  /** Forecast in thousands of cedis; null = no forecast set. */
  forecast: number | null;
}

/** The last 12 months, oldest first. Values are GH₵ thousands. */
export const MONTHLY: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (11 - i));
  return {
    label: d.toLocaleString('en-GB', { month: 'short' }),
    full: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
    actual: null,
    forecast: null,
  };
});

/** Revenue for the twelve months before `MONTHLY`, used only for the year-on-year badge. */
export const PRIOR_YEAR_TOTAL = 0;

export interface ChartWindow {
  points: MonthPoint[];
  /** What the window covers, for the summary label. */
  span: string;
  /** True when months are rolled up (the year view groups them into quarters). */
  grouped: boolean;
}

function sumOf(values: (number | null)[]) {
  return values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/**
 * Month: the last six months. Quarter: all twelve months. Year: the same twelve months
 * rolled up into four rolling quarters.
 */
export function getChartWindow(range: RangeKey, data: MonthPoint[] = MONTHLY): ChartWindow {
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
      actual: chunk.every((m) => m.actual !== null) ? sumOf(chunk.map((m) => m.actual)) : null,
      forecast: chunk.every((m) => m.forecast !== null) ? sumOf(chunk.map((m) => m.forecast)) : null,
    });
  }
  return { points, span: '12 MO', grouped: true };
}

export interface RevenueSummary {
  actualTotal: number;
  forecastTotal: number;
  attainmentPct: number | null;
  best: { label: string; value: number } | null;
  /** Year-on-year change; only meaningful for a full twelve-month window. */
  yoyPct: number | null;
  /** Difference against forecast, shown when no year-on-year figure applies. */
  vsForecastPct: number | null;
}

/** Totals for the window a range shows. Forecast only counts months that have an actual. */
export function summariseRevenue(range: RangeKey, data: MonthPoint[] = MONTHLY): RevenueSummary {
  const months = range === 'month' ? data.slice(-6) : data;
  const reported = months.filter((m) => m.actual !== null);
  const actualTotal = sumOf(months.map((m) => m.actual));
  const forecastTotal = sumOf(reported.map((m) => m.forecast));
  const best = reported.reduce<RevenueSummary['best']>(
    (b, m) => (b === null || (m.actual ?? 0) > b.value ? { label: m.label, value: m.actual ?? 0 } : b),
    null,
  );
  return {
    actualTotal,
    forecastTotal,
    attainmentPct: forecastTotal > 0 ? (actualTotal / forecastTotal) * 100 : null,
    best,
    yoyPct: range === 'month' || PRIOR_YEAR_TOTAL === 0 ? null : ((actualTotal - PRIOR_YEAR_TOTAL) / PRIOR_YEAR_TOTAL) * 100,
    vsForecastPct: forecastTotal > 0 ? ((actualTotal - forecastTotal) / forecastTotal) * 100 : null,
  };
}

/* ------------------------------------------------------------------- segments */

export interface Segment {
  id: string;
  label: string;
  /** Twelve-month revenue in thousands of cedis (rounded to 0.1M). */
  revenue: number;
  change: number;
}

export const SEGMENTS: Segment[] = [];

/* ------------------------------------------------------------------- schedule */

export type ScheduleKind = 'Internal' | 'Client Call' | 'Operations' | 'Finance';
export interface ScheduleEvent {
  id: string;
  start: string;
  end: string;
  title: string;
  kind: ScheduleKind;
  who: string;
  initials: string;
  note: string;
  featured?: boolean;
}

export const SCHEDULE: ScheduleEvent[] = [];

/** Working day used for the availability figure. */
export const WORKDAY = { start: '08:30', end: '17:30' };

export function toMinutes(hhmm: string) {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export function scheduleTotals(events: ScheduleEvent[] = SCHEDULE) {
  const booked = events.reduce((s, e) => s + (toMinutes(e.end) - toMinutes(e.start)), 0);
  const day = toMinutes(WORKDAY.end) - toMinutes(WORKDAY.start);
  return { bookedMinutes: booked, freePct: day === 0 ? 0 : ((day - booked) / day) * 100 };
}

/* ------------------------------------------------------------------- activity */

export type ActivityTone = 'lavender' | 'blue' | 'green' | 'yellow';
export type ActivityIcon = 'proforma' | 'payment' | 'stock' | 'waybill' | 'import' | 'demo';
export interface ActivityItem {
  id: string;
  icon: ActivityIcon;
  tone: ActivityTone;
  text: string;
  category: string;
  /** Minutes before "now" the event happened, so relative times stay stable. */
  minutesAgo: number;
  reference: string;
  related: string;
  by: string;
  /** Existing route to open, when that module is built. */
  to?: string;
  toLabel?: string;
}

export const ACTIVITIES: ActivityItem[] = [];

/* ------------------------------------------------------------- notifications */

export interface DemoNotification {
  id: string;
  title: string;
  body: string;
  minutesAgo: number;
  read: boolean;
}

export const NOTIFICATIONS: DemoNotification[] = [];
