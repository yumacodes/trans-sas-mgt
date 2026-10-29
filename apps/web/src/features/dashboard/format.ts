import { DEMO_CURRENCY } from './data/dashboardMockData';

const SYMBOLS: Record<string, string> = { GHS: 'GH₵', USD: '$', EUR: '€', GBP: '£' };

export function currencySymbol(currency = DEMO_CURRENCY) {
  return SYMBOLS[currency] ?? currency;
}

/** "GH₵ 4.28M", "GH₵ 684K", "GH₵ 920". Input is in whole currency units. */
export function formatCompactMoney(value: number, currency = DEMO_CURRENCY) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const sym = currencySymbol(currency);
  if (abs >= 1_000_000) return `${sign}${sym} ${trim(abs / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${sign}${sym} ${trim(abs / 1_000, abs >= 100_000 ? 0 : 1)}K`;
  return `${sign}${sym} ${Math.round(abs)}`;
}

/** Same, for values held in thousands (the chart datasets). */
export function formatThousands(valueK: number, currency = DEMO_CURRENCY) {
  return formatCompactMoney(valueK * 1000, currency);
}

function trim(n: number, digits: number) {
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1) {
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(digits)}%`;
}

export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
