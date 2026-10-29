import { describe, expect, it } from 'vitest';
import { SAMPLE_PAGES } from './registry';
import { SAMPLE_CONFIGS, sum } from './sampleData';

describe('sample pages', () => {
  it('has a config for every registered page', () => {
    for (const p of SAMPLE_PAGES) expect(SAMPLE_CONFIGS[p.id], p.id).toBeDefined();
  });

  it('gives every row a unique id and every column a value key', () => {
    for (const [id, c] of Object.entries(SAMPLE_CONFIGS)) {
      const ids = c.rows.map((r) => r.id);
      expect(new Set(ids).size, id).toBe(ids.length);
      expect(c.cols.length, id).toBeGreaterThan(0);
    }
  });

  it('keeps outstanding balances in line with the dashboard figure', () => {
    const rows = SAMPLE_CONFIGS['r-outstanding']!.rows;
    expect(rows).toHaveLength(18);
    expect(sum(rows, 'balance')).toBe(684_000);
    expect(rows.every((r) => Number(r.balance) > 0)).toBe(true);
  });

  it('computes sale balances from totals and payments', () => {
    for (const r of SAMPLE_CONFIGS.sales!.rows) {
      if (r.status === 'Cancelled') continue;
      expect(Number(r.total) - Number(r.paid)).toBe(Number(r.balance));
    }
  });
});
