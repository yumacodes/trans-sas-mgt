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
    { id: 'sales', label: 'Sales value · MTD', value: 1_520_000, unit: 'money', change: 6.8, upIsGood: true, caption: '49 recorded sales', trend: [210, 260, 240, 310, 290, 355, 410, 430], tone: 'var(--color-chart-navy)' },
    { id: 'payments', label: 'Payments received', value: 1_040_000, unit: 'money', change: 3.1, upIsGood: true, caption: 'Payments recorded this month', trend: [120, 150, 200, 180, 240, 260, 300, 310], tone: 'var(--color-info)' },
    { id: 'outstanding', label: 'Outstanding balances', value: 684_000, unit: 'money', change: 2.4, upIsGood: false, caption: '18 invoices with balances', trend: [640, 650, 648, 662, 670, 668, 678, 684], tone: '#5b4bd1' },
    { id: 'stock', label: 'Stock availability', value: 0, unit: 'percent', change: null, upIsGood: true, caption: '', trend: [93.1, 93.4, 93.4, 93.8, 94.0, 93.9, 94.1, 94.2], tone: 'var(--color-chart-teal)', to: '/stock' },
  ],
  quarter: [
    { id: 'sales', label: 'Sales value · QTD', value: 4_280_000, unit: 'money', change: 12.4, upIsGood: true, caption: '142 recorded sales', trend: [520, 610, 580, 720, 690, 810, 905, 980], tone: 'var(--color-chart-navy)' },
    { id: 'payments', label: 'Payments received', value: 2_860_000, unit: 'money', change: 8.2, upIsGood: true, caption: 'Payments recorded this quarter', trend: [300, 340, 410, 390, 480, 520, 560, 610], tone: 'var(--color-info)' },
    { id: 'outstanding', label: 'Outstanding balances', value: 684_000, unit: 'money', change: 5.1, upIsGood: false, caption: '18 invoices with balances', trend: [602, 618, 640, 631, 655, 662, 670, 684], tone: '#5b4bd1' },
    { id: 'stock', label: 'Stock availability', value: 0, unit: 'percent', change: null, upIsGood: true, caption: '', trend: [91.5, 92.0, 92.6, 93.0, 93.4, 93.8, 94.0, 94.2], tone: 'var(--color-chart-teal)', to: '/stock' },
  ],
  year: [
    { id: 'sales', label: 'Sales value · YTD', value: 16_940_000, unit: 'money', change: 15.9, upIsGood: true, caption: '561 recorded sales', trend: [900, 1100, 1250, 1180, 1420, 1510, 1630, 1780], tone: 'var(--color-chart-navy)' },
    { id: 'payments', label: 'Payments received', value: 11_630_000, unit: 'money', change: 11.7, upIsGood: true, caption: 'Payments recorded this year', trend: [610, 760, 880, 820, 990, 1040, 1120, 1210], tone: 'var(--color-info)' },
    { id: 'outstanding', label: 'Outstanding balances', value: 684_000, unit: 'money', change: -3.2, upIsGood: false, caption: '18 invoices with balances', trend: [760, 742, 735, 720, 712, 700, 691, 684], tone: '#5b4bd1' },
    { id: 'stock', label: 'Stock availability', value: 0, unit: 'percent', change: null, upIsGood: true, caption: '', trend: [88.2, 89.5, 90.4, 91.8, 92.6, 93.4, 93.9, 94.2], tone: 'var(--color-chart-teal)', to: '/stock' },
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
export const INVENTORY: InventoryCategory[] = [
  { id: 'diagnostic', label: 'Diagnostic Equipment', tracked: 34, belowReorder: 2 },
  { id: 'monitoring', label: 'Patient Monitoring', tracked: 29, belowReorder: 1 },
  { id: 'surgical', label: 'Surgical Equipment', tracked: 31, belowReorder: 2 },
  { id: 'laboratory', label: 'Laboratory Equipment', tracked: 26, belowReorder: 1 },
  { id: 'consumables', label: 'Consumables', tracked: 18, belowReorder: 2 },
];

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
export const MONTHLY: MonthPoint[] = [
  { label: 'Nov', full: 'November 2025', actual: 760, forecast: 700 },
  { label: 'Dec', full: 'December 2025', actual: 800, forecast: 730 },
  { label: 'Jan', full: 'January 2026', actual: 750, forecast: 720 },
  { label: 'Feb', full: 'February 2026', actual: 800, forecast: 740 },
  { label: 'Mar', full: 'March 2026', actual: 830, forecast: 760 },
  { label: 'Apr', full: 'April 2026', actual: 815, forecast: 770 },
  { label: 'May', full: 'May 2026', actual: 843, forecast: 790 },
  { label: 'Jun', full: 'June 2026', actual: 851, forecast: 800 },
  { label: 'Jul', full: 'July 2026', actual: 864, forecast: 820 },
  { label: 'Aug', full: 'August 2026', actual: 846, forecast: 830 },
  { label: 'Sep', full: 'September 2026', actual: 859, forecast: 840 },
  { label: 'Oct', full: 'October 2026', actual: 822, forecast: 810 },
];

/** Revenue for the twelve months before `MONTHLY`, used only for the year-on-year badge. */
export const PRIOR_YEAR_TOTAL = 8_297;

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
    yoyPct: range === 'month' ? null : ((actualTotal - PRIOR_YEAR_TOTAL) / PRIOR_YEAR_TOTAL) * 100,
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

export const SEGMENTS: Segment[] = [
  { id: 'hospital', label: 'Hospital Equipment', revenue: 4_100, change: 22 },
  { id: 'diagnostic', label: 'Diagnostic Equipment', revenue: 3_200, change: 14 },
  { id: 'consumables', label: 'Consumables', revenue: 1_400, change: -6 },
  { id: 'service', label: 'Service & Maintenance', revenue: 1_100, change: 31 },
];

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

export const SCHEDULE: ScheduleEvent[] = [
  { id: 'ev1', start: '09:30', end: '10:00', title: 'Pipeline stand-up', kind: 'Internal', who: 'Sales team', initials: 'ST', note: 'Review open proformas and upcoming tender deadlines.' },
  { id: 'ev2', start: '11:15', end: '12:00', title: 'Medical equipment quotation review', kind: 'Client Call', who: 'Demo client representative', initials: 'DC', note: 'Walk through the proposed price schedule and delivery terms.', featured: true },
  { id: 'ev3', start: '14:00', end: '14:45', title: 'Procurement and stock review', kind: 'Operations', who: 'Inventory team', initials: 'IT', note: 'Confirm purchase orders for items below reorder level.' },
  { id: 'ev4', start: '16:30', end: '17:00', title: 'Outstanding payment follow-up', kind: 'Finance', who: 'Accounts team', initials: 'AT', note: 'Contact clients with invoices past their due date.' },
];

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

export const ACTIVITIES: ActivityItem[] = [
  { id: 'a1', icon: 'proforma', tone: 'lavender', text: 'A proforma was prepared for a hospital client', category: 'Proforma', minutesAgo: 18, reference: 'PRF-2026-0142', related: 'Sample Teaching Hospital', by: 'Demo Sales User' },
  { id: 'a2', icon: 'payment', tone: 'green', text: 'A payment was recorded against an outstanding invoice', category: 'Payment', minutesAgo: 52, reference: 'PAY-2026-0318', related: 'INV-2026-0207', by: 'Demo Accountant' },
  { id: 'a3', icon: 'stock', tone: 'blue', text: 'Stock was received for diagnostic equipment', category: 'Stock', minutesAgo: 190, reference: 'GRN-2026-0061', related: 'Diagnostic Equipment · 12 units', by: 'Demo Inventory User', to: '/stock', toLabel: 'Open stock' },
  { id: 'a4', icon: 'waybill', tone: 'yellow', text: 'A waybill was generated for a completed sale', category: 'Delivery', minutesAgo: 26 * 60, reference: 'WB-2026-0095', related: 'SAL-2026-0133', by: 'Demo Support User' },
  { id: 'a5', icon: 'import', tone: 'lavender', text: 'An authorised user imported stock items from an Excel spreadsheet', category: 'Import', minutesAgo: 2 * 24 * 60 + 40, reference: 'IMP-2026-0012', related: '48 rows · 46 accepted', by: 'Demo Admin', to: '/stock-items', toLabel: 'Open stock items' },
];

/* ------------------------------------------------------------- notifications */

export interface DemoNotification {
  id: string;
  title: string;
  body: string;
  minutesAgo: number;
  read: boolean;
}

export const NOTIFICATIONS: DemoNotification[] = [
  { id: 'n1', title: 'Low stock', body: '8 items are at or below their reorder level.', minutesAgo: 35, read: false },
  { id: 'n2', title: 'Payment recorded', body: 'A payment was applied to INV-2026-0207.', minutesAgo: 52, read: false },
  { id: 'n3', title: 'Import finished', body: 'Stock import IMP-2026-0012 completed with 2 rejected rows.', minutesAgo: 2 * 24 * 60, read: true },
];
