import { describe, expect, it } from 'vitest';
import { isMoneyString, sumMoney, toMoneyString } from './money';
import { moneyString } from './schemas/common';
import { companySettingsSchema, DEFAULT_COMPANY_SETTINGS } from './schemas/company';

describe('money helpers', () => {
  it('sums decimal strings without floating-point drift', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(sumMoney(['1999.99', '0.01', '1000'])).toBe('3000.00');
  });

  it('rounds half up to two places', () => {
    expect(toMoneyString('2.345')).toBe('2.35');
    expect(toMoneyString('2.344')).toBe('2.34');
  });

  it('validates money strings', () => {
    expect(isMoneyString('12.50')).toBe(true);
    expect(isMoneyString('12.505')).toBe(true);
    expect(isMoneyString('1e5')).toBe(false);
    expect(isMoneyString('abc')).toBe(false);
  });

  it('rejects negative and malformed amounts in schemas', () => {
    const schema = moneyString('Price');
    expect(schema.safeParse('10.00').success).toBe(true);
    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse('-1').success).toBe(false);
    expect(schema.safeParse('ten').success).toBe(false);
    expect(moneyString('Price', { allowZero: false }).safeParse('0.00').success).toBe(false);
  });
});

describe('company settings', () => {
  it('accepts the defaults', () => {
    expect(companySettingsSchema.safeParse(DEFAULT_COMPANY_SETTINGS).success).toBe(true);
  });

  it('rejects tax rates above 100', () => {
    const result = companySettingsSchema.safeParse({ ...DEFAULT_COMPANY_SETTINGS, defaultTaxRate: '101' });
    expect(result.success).toBe(false);
  });
});
