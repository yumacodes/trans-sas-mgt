import type { DashboardOverviewDto } from '@tsm/shared';
import { downloadReportExcel, type ExportRow } from '@/lib/exportExcel';
import type { KpiDef, MonthPoint } from './data/model';

/**
 * Lays out the figures currently on the dashboard as spreadsheet rows. A row of one string
 * is a section heading; an empty row is a spacer.
 */
export function buildDashboardSheet(o: DashboardOverviewDto, kpis: KpiDef[], monthly: MonthPoint[], scope: string): ExportRow[] {
  return [
    ['Dashboard - management figures from the records in the system'],
    [`Period: ${o.period.from} to ${o.period.to}`, `Scope: ${scope}`, `Currency: ${o.currency}`],
    [],
    ['Key figures'],
    ['Measure', 'Value', 'Unit', 'Change vs previous period (%)', 'Note'],
    ...kpis.map((k) => [
      k.label,
      k.unit === 'money' ? k.value : Number(k.value.toFixed(1)),
      k.unit === 'money' ? o.currency : '%',
      k.change === null ? null : Number(k.change.toFixed(1)),
      k.caption,
    ]),
    [],
    ['Last twelve months'],
    ['Month', 'Revenue excl. tax', 'Payments received'],
    ...monthly.map((m) => [m.full, Math.round(m.actual * 1000 * 100) / 100, Math.round(m.payments * 1000 * 100) / 100]),
    [],
    ['Revenue by category, last 12 months'],
    ['Category', 'Revenue', 'Previous 12 months'],
    ...(o.segments ?? []).map((s) => [s.label, Number(s.revenue), Number(s.previous)]),
  ];
}

export function downloadDashboardReport(o: DashboardOverviewDto, kpis: KpiDef[], monthly: MonthPoint[], scope: string) {
  return downloadReportExcel(`dashboard-${o.period.to}.xlsx`, buildDashboardSheet(o, kpis, monthly, scope), {
    sheet: 'Dashboard',
    widths: [34, 18, 18, 28, 40],
  });
}
