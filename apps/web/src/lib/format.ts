import { formatMoney as formatSharedMoney, type MoneyInput } from '@tsm/shared';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Formats a business date ("YYYY-MM-DD"). It is interpreted in UTC so the displayed day
 * never shifts with the viewer's timezone.
 */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const businessDate = value.slice(0, 10);
  const d = new Date(`${businessDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? value : dateFormatter.format(d);
}

/** Formats an event timestamp in the viewer's local time. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : dateTimeFormatter.format(d);
}

/** Today's date as a business date string in the viewer's local calendar. */
export function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Decimal quantity string such as "12.500" rendered as "12.5". Works on the string to avoid float drift. */
export function formatQuantity(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const s = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [intPart = '0', frac = ''] = s.split('.');
  const trimmed = frac.replace(/0+$/, '');
  const negative = intPart.startsWith('-');
  const digits = negative ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${trimmed ? `.${trimmed}` : ''}`;
}

export function formatMoney(value: MoneyInput | null | undefined, currency: string) {
  return formatSharedMoney(value, currency);
}

export function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "5 minutes ago", "yesterday"; falls back to a date for anything older than a week. */
export function formatRelative(value: string | null | undefined, now = Date.now()) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = then - now;
  const abs = Math.abs(diff);
  if (abs > 7 * 86_400_000) return formatDate(value);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** Morning / afternoon / evening greeting for a local hour (0–23). */
export function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Tuesday · 28 October 2026" in the browser's locale. */
export function formatLongDate(date = new Date()) {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const rest = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${weekday} · ${rest}`;
}
