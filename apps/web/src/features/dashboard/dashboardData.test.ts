import { describe, expect, it } from 'vitest';
import {
  MONTHLY,
  SCHEDULE,
  SEGMENTS,
  categoryHealth,
  getChartWindow,
  getKpis,
  inventoryTotals,
  INVENTORY,
  scheduleTotals,
  summariseRevenue,
} from './data/dashboardMockData';
import { buildDashboardCsv } from './exportCsv';
import { formatCompactMoney, formatMinutes } from './format';

describe('dashboard sample data', () => {
  it('derives the headline revenue figures from the monthly series', () => {
    const s = summariseRevenue('quarter');
    expect(s.actualTotal).toBe(9840);
    expect(s.forecastTotal).toBe(9310);
    expect(Math.round(s.attainmentPct ?? 0)).toBe(106);
    expect(s.best).toEqual({ label: 'Jul', value: 864 });
    expect(s.yoyPct?.toFixed(1)).toBe('18.6');
  });

  it('keeps the year view equal to the sum of the monthly points', () => {
    const win = getChartWindow('year');
    expect(win.points).toHaveLength(4);
    expect(win.points.reduce((s, p) => s + (p.actual ?? 0), 0)).toBe(
      MONTHLY.reduce((s, p) => s + (p.actual ?? 0), 0),
    );
  });

  it('does not invent values for months without a report', () => {
    const data = [...MONTHLY.slice(0, 2), { label: 'Jan', full: 'January', actual: null, forecast: 700 }];
    const s = summariseRevenue('quarter', data);
    expect(s.actualTotal).toBe(1560);
    expect(s.forecastTotal).toBe(1430);
  });

  it('computes stock availability from the inventory categories', () => {
    const { tracked, below, availabilityPct } = inventoryTotals();
    expect(tracked).toBe(138);
    expect(below).toBe(8);
    expect(availabilityPct.toFixed(1)).toBe('94.2');
    const stock = getKpis('quarter').find((k) => k.id === 'stock');
    expect(stock?.caption).toBe('8 items below reorder level');
    expect(INVENTORY.filter((c) => categoryHealth(c).attention).map((c) => c.id)).toEqual(['consumables']);
  });

  it('totals the schedule', () => {
    expect(scheduleTotals(SCHEDULE).bookedMinutes).toBe(150);
  });

  it('keeps segment totals close to, but not claimed equal to, revenue', () => {
    const total = SEGMENTS.reduce((s, x) => s + x.revenue, 0);
    expect(Math.abs(total - 9840)).toBeLessThan(100);
  });
});

describe('dashboard formatting and export', () => {
  it('formats compact cedi amounts', () => {
    expect(formatCompactMoney(4_280_000)).toBe('GH₵ 4.28M');
    expect(formatCompactMoney(684_000)).toBe('GH₵ 684K');
    expect(formatMinutes(150)).toBe('2h 30m');
  });

  it('exports a labelled CSV with the displayed figures', () => {
    const csv = buildDashboardCsv('quarter');
    expect(csv.split('\r\n')[0]).toContain('not an official financial report');
    expect(csv).toContain('Sales value · QTD,4280000,GHS,12.4');
    expect(csv).toContain('Hospital Equipment,4100,22');
  });
});
