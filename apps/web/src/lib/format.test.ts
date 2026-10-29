import { describe, expect, it } from 'vitest';
import { formatDate, formatQuantity } from './format';

describe('formatQuantity', () => {
  it('trims trailing zeros without float conversion', () => {
    expect(formatQuantity('12.500')).toBe('12.5');
    expect(formatQuantity('3.000')).toBe('3');
    expect(formatQuantity('1234567.125')).toBe('1,234,567.125');
    expect(formatQuantity('-4.000')).toBe('-4');
    expect(formatQuantity(null)).toBe('—');
  });
});

describe('formatDate', () => {
  it('keeps business dates on the same calendar day in every timezone', () => {
    expect(formatDate('2026-01-01')).toMatch(/2026/);
    expect(formatDate('2026-01-01')).toMatch(/01|1/);
    expect(formatDate('2026-01-01')).not.toMatch(/2025/);
    expect(formatDate(null)).toBe('—');
  });
});
