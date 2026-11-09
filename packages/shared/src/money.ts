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

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const SCALES = ['', 'THOUSAND', 'MILLION', 'BILLION', 'TRILLION'];

function belowThousand(n: number): string {
  const words: string[] = [];
  if (n >= 100) {
    words.push(`${ONES[Math.floor(n / 100)]} HUNDRED`);
    n %= 100;
  }
  if (n >= 20) {
    words.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]!);
  } else if (n > 0) {
    words.push(ONES[n]!);
  }
  return words.join(' ');
}

/** Whole number in English words, e.g. 7200 → "SEVEN THOUSAND TWO HUNDRED". */
export function integerInWords(value: bigint): string {
  if (value === 0n) return 'ZERO';
  const groups: string[] = [];
  let rest = value;
  let scale = 0;
  while (rest > 0n) {
    const chunk = Number(rest % 1000n);
    if (chunk) groups.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
    rest /= 1000n;
    scale += 1;
  }
  return groups.join(' ');
}

const CURRENCY_WORDS: Record<string, [major: string, minor: string]> = {
  GHS: ['GHANA CEDIS', 'PESEWAS'],
  USD: ['US DOLLARS', 'CENTS'],
};

/** Amount in words for documents, e.g. "SEVEN THOUSAND TWO HUNDRED GHANA CEDIS ONLY". */
export function amountInWords(value: MoneyInput, currency: string): string {
  const fixed = toMoneyString(value);
  const [whole, fraction] = fixed.replace('-', '').split('.') as [string, string];
  const [major, minor] = CURRENCY_WORDS[currency] ?? [currency, 'CENTS'];
  const cents = Number(fraction);
  const main = `${integerInWords(BigInt(whole))} ${major}`;
  return cents ? `${main} AND ${integerInWords(BigInt(cents))} ${minor} ONLY` : `${main} ONLY`;
}
