import {
  DEMO_CURRENCY,
  SEGMENTS,
  getChartWindow,
  getKpis,
  summariseRevenue,
  type RangeKey,
} from './data/dashboardMockData';

export function cell(v: string | number | null) {
  if (v === null) return '';
  if (typeof v === 'number') return String(v);
  // Quote anything that could break the row, or be read as a formula by a spreadsheet.
  return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Builds a CSV of the figures currently on the dashboard. Pure so it can be tested. */
export function buildDashboardCsv(range: RangeKey): string {
  const rows: (string | number | null)[][] = [
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
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Downloads the CSV in the browser. A leading BOM keeps ₵ and other symbols intact in Excel. */
export function downloadDashboardCsv(range: RangeKey) {
  const blob = new Blob(['﻿', buildDashboardCsv(range)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-sample-${range}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Saves already-built CSV text as a download (UTF-8 with BOM so Excel reads symbols). */
export function downloadCsvText(text: string, filename: string) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
