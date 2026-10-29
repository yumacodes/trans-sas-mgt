import { downloadReportExcel, type ExportRow } from '@/lib/exportExcel';
import {
  DEMO_CURRENCY,
  SEGMENTS,
  getChartWindow,
  getKpis,
  summariseRevenue,
  type RangeKey,
} from './data/dashboardMockData';

/**
 * Lays out the figures currently on the dashboard as spreadsheet rows. Pure, so the
 * numbers can be checked without writing a file. A row of one string is a section
 * heading and is emitted in bold; an empty row is a spacer.
 */
export function buildDashboardSheet(range: RangeKey): ExportRow[] {
  return [
    ['Dashboard sample data - not an official financial report'],
    [`Period: ${range}`, `Currency: ${DEMO_CURRENCY}`],
    [],
    ['Key figures'],
    ['Measure', 'Value', 'Unit', 'Change vs previous period (%)', 'Note'],
    ...getKpis(range).map((k) => [
      k.label,
      k.unit === 'money' ? k.value : Number(k.value.toFixed(1)),
      k.unit === 'money' ? DEMO_CURRENCY : '%',
      k.change,
      k.caption,
    ]),
    [],
    ['Revenue vs forecast (thousands)'],
    ['Period', 'Actual', 'Forecast'],
    ...getChartWindow(range).points.map((p) => [p.full, p.actual, p.forecast]),
    [],
    ['Summary'],
    ...Object.entries(summariseRevenue(range)).map(([k, v]) => [
      k,
      typeof v === 'object' && v !== null ? `${v.label} ${v.value}` : v === null ? null : Number(v.toFixed(2)),
    ]),
    [],
    ['Segments (12 months, thousands)'],
    ['Segment', 'Revenue', 'Change (%)'],
    ...SEGMENTS.map((s) => [s.label, s.revenue, s.change]),
  ];
}

/** Downloads those figures as an Excel workbook. */
export function downloadDashboardReport(range: RangeKey) {
  return downloadReportExcel(`dashboard-sample-${range}.xlsx`, buildDashboardSheet(range), {
    sheet: 'Dashboard',
    widths: [34, 16, 12, 28, 46],
  });
}
