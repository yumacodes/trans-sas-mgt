import { describe, expect, it } from 'vitest';
import { amountInWords, isMoneyString, sumMoney, toMoneyString } from './money';
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

describe('amountInWords', () => {
  it('writes whole amounts the way the documents do', () => {
    expect(amountInWords('7200.00', 'GHS')).toBe('SEVEN THOUSAND TWO HUNDRED GHANA CEDIS ONLY');
    expect(amountInWords('1000000', 'USD')).toBe('ONE MILLION US DOLLARS ONLY');
    expect(amountInWords('0', 'GHS')).toBe('ZERO GHANA CEDIS ONLY');
  });

  it('adds pesewas and hyphenates tens', () => {
    expect(amountInWords('1234.56', 'GHS')).toBe(
      'ONE THOUSAND TWO HUNDRED THIRTY-FOUR GHANA CEDIS AND FIFTY-SIX PESEWAS ONLY',
    );
    expect(amountInWords('12000015.05', 'USD')).toBe('TWELVE MILLION FIFTEEN US DOLLARS AND FIVE CENTS ONLY');
  });
});

describe('calculateTenderTotals', () => {
  it('adds tax per line and sums the lines into the grand total', async () => {
    const { calculateTenderTotals } = await import('./schemas/tender');
    const t = calculateTenderTotals(
      [
        { quantity: '2', unitPrice: '3000' },
        { quantity: '3', unitPrice: '0.35' },
      ],
      '20',
    );
    expect(t.amounts).toEqual(['6000.00', '1.05']);
    expect(t.amountsWithTax).toEqual(['7200.00', '1.26']);
    expect(t.subtotal).toBe('6001.05');
    expect(t.total).toBe('7201.26');
    expect(t.taxAmount).toBe('1200.21');
  });
});
