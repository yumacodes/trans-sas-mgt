import type { ReportCell, ReportColumn, ReportLink, ReportRow } from '@tsm/shared';
import type { DatePreset } from '@/components/app/DateRangeFilter';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';

/** Columns that hold numbers: right-aligned, tabular, and sorted numerically. */
export const RIGHT = new Set<ReportColumn['format']>(['money', 'quantity', 'count', 'percent']);

export const REPORT_DATE_PRESETS: DatePreset[] = [
  'this-month',
  'last-month',
  'this-quarter',
  'last-quarter',
  'year-to-date',
  'last-12-months',
  'custom',
];

export function show(column: ReportColumn, row: ReportRow): string {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  switch (column.format) {
    case 'money': {
      const currency = column.currencyKey ? String(row[column.currencyKey] ?? '') : '';
      return currency && currency !== 'Cost' ? formatMoney(String(value), currency) : formatQuantity(String(value));
    }
    case 'quantity':
      return formatQuantity(String(value));
    case 'date':
      return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? formatDate(String(value)) : String(value);
    case 'percent':
      return `${value}%`;
    default:
      return String(value);
  }
}

/** Plain value for a spreadsheet cell, so amounts stay numeric. */
export function sheetValue(column: ReportColumn, value: ReportCell) {
  if (value === null || value === undefined) return null;
  if (RIGHT.has(column.format)) return Number(value);
  return String(value);
}

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/** "total:desc" → { key: 'total', dir: 'desc' }. */
export function parseSort(value: string | null): SortState {
  if (!value) return null;
  const [key, dir] = value.split(':');
  return key ? { key, dir: dir === 'desc' ? 'desc' : 'asc' } : null;
}

/** Rows sorted by one column: numbers numerically, text naturally, empty cells always last. */
export function sortRows(rows: ReportRow[], columns: ReportColumn[], sort: SortState): ReportRow[] {
  const column = sort && columns.find((c) => c.key === sort.key);
  if (!sort || !column) return rows;
  const numeric = RIGHT.has(column.format);
  const sign = sort.dir === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const empty = (v: ReportCell | undefined) => v === null || v === undefined || v === '';
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row[column.key];
      const y = b.row[column.key];
      if (empty(x) || empty(y)) return empty(x) === empty(y) ? a.index - b.index : empty(x) ? 1 : -1;
      const order = numeric ? Number(x) - Number(y) : collator.compare(String(x), String(y));
      return order === 0 ? a.index - b.index : order * sign;
    })
    .map((r) => r.row);
}

/**
 * Where a cell links to: the record itself (`?open=<id>`) or a filtered list. Returns null
 * when the row lacks what the link needs, so the cell shows as plain text.
 */
export function cellLink(
  link: ReportLink,
  row: ReportRow,
  scope: { dateFrom?: string; dateTo?: string; branchId?: string },
): string | null {
  const path = link.path ?? (link.pathKey ? row[link.pathKey] : null);
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  const params = new URLSearchParams();
  if (link.scoped) {
    for (const [name, value] of Object.entries(scope)) if (value) params.set(name, value);
  }
  for (const [name, value] of Object.entries(link.fixed ?? {})) params.set(name, value);
  for (const [name, field] of Object.entries(link.filters ?? {})) {
    const value = row[field];
    if (value === null || value === undefined || value === '') {
      // A branch-level row without its branch id must not link to every branch's records.
      if (name === 'branchId') return null;
      continue;
    }
    params.set(name, String(value));
  }
  if (link.openKey) {
    const id = row[link.openKey];
    if (id === null || id === undefined || id === '') return null;
    params.set('open', String(id));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
