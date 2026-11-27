import { describe, expect, it } from 'vitest';
import type { ReportColumn } from '@tsm/shared';
import { matchPreset, presetRange } from '@/components/app/DateRangeFilter';
import { cellLink, sortRows } from './reportTable';

describe('date presets', () => {
  const today = '2026-11-26'; // a Thursday

  it('works out calendar periods from the local date', () => {
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('this-week', today)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(presetRange('this-month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(presetRange('last-month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('this-quarter', today)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(presetRange('last-quarter', today)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(presetRange('year-to-date', today)).toEqual({ from: '2026-01-01', to: today });
    expect(presetRange('last-12-months', today)).toEqual({ from: '2025-12-01', to: today });
    expect(presetRange('any', today)).toBeNull();
  });

  it('crosses month and year boundaries', () => {
    expect(presetRange('this-week', '2026-03-01')).toEqual({ from: '2026-02-23', to: '2026-03-01' });
    expect(presetRange('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('last-quarter', '2026-02-10')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(presetRange('this-month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('recognises the preset a pair of dates stands for', () => {
    expect(matchPreset('2026-10-01', '2026-10-31', undefined, '2026-11-26')).toBe('last-month');
    expect(matchPreset('2026-10-02', '2026-10-31', undefined, '2026-11-26')).toBe('custom');
    expect(matchPreset(undefined, undefined)).toBe('any');
    expect(matchPreset(undefined, undefined, ['this-month', 'custom'])).toBe('custom');
  });
});

describe('report table', () => {
  const columns: ReportColumn[] = [
    { key: 'number', label: 'Sale', format: 'text' },
    { key: 'total', label: 'Total', format: 'money', currencyKey: 'currency' },
  ];
  const rows = [
    { number: 'S-10', total: '900.00' },
    { number: 'S-2', total: '1000.00' },
    { number: 'S-1', total: null },
  ];

  it('sorts money numerically and keeps empty cells last', () => {
    expect(sortRows(rows, columns, { key: 'total', dir: 'asc' }).map((r) => r.number)).toEqual(['S-10', 'S-2', 'S-1']);
    expect(sortRows(rows, columns, { key: 'total', dir: 'desc' }).map((r) => r.number)).toEqual(['S-2', 'S-10', 'S-1']);
  });

  it('sorts references naturally', () => {
    expect(sortRows(rows, columns, { key: 'number', dir: 'asc' }).map((r) => r.number)).toEqual(['S-1', 'S-2', 'S-10']);
  });

  it('links to a record or to a filtered list', () => {
    expect(cellLink({ path: '/sales', openKey: 'id' }, { id: 'abc' }, {})).toBe('/sales?open=abc');
    expect(cellLink({ path: '/sales', openKey: 'id' }, { id: null }, {})).toBeNull();
    expect(
      cellLink(
        { path: '/sales', scoped: true, fixed: { status: 'confirmed' }, filters: { branchId: 'branchId' } },
        { branchId: 'b1' },
        { dateFrom: '2026-10-01', dateTo: '2026-10-31' },
      ),
    ).toBe('/sales?dateFrom=2026-10-01&dateTo=2026-10-31&status=confirmed&branchId=b1');
    // A branch row without its id must not open every branch's sales.
    expect(cellLink({ path: '/sales', filters: { branchId: 'branchId' } }, { branchId: null }, {})).toBeNull();
    expect(cellLink({ pathKey: 'path', openKey: 'id' }, { path: '/expenses/tender-in', id: 'e1' }, {})).toBe('/expenses/tender-in?open=e1');
  });
});
