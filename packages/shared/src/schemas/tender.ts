import { z } from 'zod';
import { toDecimal, toMoneyString } from '../money';
import { isoDate, listQuerySchema, moneyString, optionalText, requiredText, uuid } from './common';
import { PROFORMA_CURRENCIES, type ProformaCurrency } from './proforma';

/**
 * Tender price schedules: the priced list of items submitted for a tender lot. A schedule
 * existing does not mean the tender was won; "awarded" is set only when the award arrives.
 */
export const TENDER_STATUSES = ['draft', 'submitted', 'awarded', 'not_awarded', 'cancelled'] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  awarded: 'Awarded',
  not_awarded: 'Not awarded',
  cancelled: 'Cancelled',
};

const percentage = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim() || '0')
    .refine((v) => /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(v), `${label} must be between 0 and 100.`);

export const tenderItemInputSchema = z.object({
  stockItemId: uuid.nullable().optional(),
  description: requiredText('Description', 300),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Enter a quantity greater than zero.'),
  unit: requiredText('Unit', 30),
  unitPrice: moneyString('Unit price'),
  countryOfOrigin: optionalText(80),
  manufacturer: optionalText(150),
  brand: optionalText(100),
  /** Free text as printed, e.g. "10.2026". */
  expiryDate: optionalText(30),
});
export type TenderItemInput = z.input<typeof tenderItemInputSchema>;

export const tenderInputSchema = z.object({
  /** Branch the document belongs to. Omit to use the user's own branch. */
  branchId: uuid.nullable().optional(),
  scheduleDate: isoDate,
  /** The procuring organisation's reference ("Your Ref"). */
  tenderReference: optionalText(100),
  submissionDeadline: isoDate.nullable().optional(),
  clientId: uuid.nullable().optional(),
  customerName: requiredText('Procuring organisation', 200),
  customerAddress: optionalText(500),
  /** e.g. "2 DRESSING ITEMS". */
  lot: optionalText(150),
  currency: z.enum(PROFORMA_CURRENCIES),
  /** What the tax is called on the schedule, e.g. "VAT + NHIL". */
  taxLabel: requiredText('Tax name', 40),
  taxRate: percentage('Tax'),
  notes: optionalText(2000),
  items: z.array(tenderItemInputSchema).min(1, 'Add at least one item.').max(300),
});
export type TenderInput = z.input<typeof tenderInputSchema>;

export const tenderStatusSchema = z.object({ status: z.enum(TENDER_STATUSES) });

export const tenderListQuerySchema = listQuerySchema.extend({
  branchId: uuid.optional(),
  status: z.enum(TENDER_STATUSES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export interface TenderTotals {
  /** Per line: quantity × unit price. */
  amounts: string[];
  /** Per line: amount with tax added. */
  amountsWithTax: string[];
  subtotal: string;
  taxAmount: string;
  total: string;
}

/**
 * Tax is applied per line (as printed in the "total incl. tax" column) and the grand total
 * is the sum of those lines, so the printed column always adds up to the grand total.
 */
export function calculateTenderTotals(
  items: { quantity: string | number; unitPrice: string | number }[],
  taxRate: string | number,
): TenderTotals {
  const rate = toDecimal(taxRate).div(100);
  const amounts = items.map((i) => toDecimal(i.quantity).times(toDecimal(i.unitPrice)).toDecimalPlaces(2));
  const withTax = amounts.map((a) => a.plus(a.times(rate)).toDecimalPlaces(2));
  const subtotal = amounts.reduce((a, b) => a.plus(b), toDecimal(0));
  const total = withTax.reduce((a, b) => a.plus(b), toDecimal(0));
  return {
    amounts: amounts.map((a) => toMoneyString(a)),
    amountsWithTax: withTax.map((a) => toMoneyString(a)),
    subtotal: toMoneyString(subtotal),
    taxAmount: toMoneyString(total.minus(subtotal)),
    total: toMoneyString(total),
  };
}

export interface TenderItemDto {
  id: string;
  stockItemId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
  amountWithTax: string;
  countryOfOrigin: string | null;
  manufacturer: string | null;
  brand: string | null;
  expiryDate: string | null;
}

export interface TenderDto {
  id: string;
  branch: { id: string; code: string; name: string } | null;
  number: string;
  scheduleDate: string;
  tenderReference: string | null;
  submissionDeadline: string | null;
  clientId: string | null;
  customerName: string;
  customerAddress: string | null;
  lot: string | null;
  currency: ProformaCurrency;
  taxLabel: string;
  taxRate: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  totalInWords: string;
  notes: string | null;
  status: TenderStatus;
  itemCount: number;
  items: TenderItemDto[];
  preparedBy: string;
  createdAt: string;
  updatedAt: string;
}
