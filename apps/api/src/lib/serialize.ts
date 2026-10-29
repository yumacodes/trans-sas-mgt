import type { Prisma } from '@prisma/client';

type DecimalLike = Prisma.Decimal | { toFixed(dp: number): string };

export function decimalString(value: DecimalLike, places = 2): string {
  return value.toFixed(places);
}

export function optionalDecimalString(value: DecimalLike | null | undefined, places = 2): string | null {
  return value === null || value === undefined ? null : value.toFixed(places);
}

export function iso(value: Date): string {
  return value.toISOString();
}

/** Date-only business field (stored as DATE) → "YYYY-MM-DD". */
export function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function optionalIsoDateOnly(value: Date | null | undefined): string | null {
  return value ? isoDateOnly(value) : null;
}

/** "YYYY-MM-DD" → Date at UTC midnight, matching how Prisma reads DATE columns. */
export function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
