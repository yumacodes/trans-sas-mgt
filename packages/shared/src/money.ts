import Decimal from 'decimal.js';

/**
 * Monetary values travel through the API as decimal strings (e.g. "1250.00") and are
 * stored as PostgreSQL NUMERIC. All arithmetic goes through decimal.js; never use
 * JavaScript floating-point numbers for authoritative amounts.
 */
export const MoneyDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = string | number | Decimal;

export function toDecimal(value: MoneyInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new MoneyDecimal(0);
  return new MoneyDecimal(value);
}

/** Round to a fixed number of places and return the canonical string form. */
export function toMoneyString(value: MoneyInput, places = 2): string {
  return toDecimal(value).toDecimalPlaces(places).toFixed(places);
}

export function sumMoney(values: MoneyInput[], places = 2): string {
  return toMoneyString(
    values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new MoneyDecimal(0)),
    places,
  );
}

const MONEY_PATTERN = /^-?\d{1,14}(\.\d{1,4})?$/;

export function isMoneyString(value: string): boolean {
  return MONEY_PATTERN.test(value);
}

export function formatMoney(value: MoneyInput | null | undefined, currency: string, locale?: string) {
  if (value === null || value === undefined || value === '') return '—';
  // Intl accepts a string-formatted number without float conversion in modern runtimes;
  // fall back to Number only for display purposes.
  const fixed = toMoneyString(value);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(fixed as unknown as number);
  } catch {
    return `${currency} ${fixed}`;
  }
}
