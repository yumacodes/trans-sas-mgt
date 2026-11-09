import { z } from 'zod';
import { toDecimal, toMoneyString } from '../money';
import {
  isoDate,
  listQuerySchema,
  moneyString,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
  uuid,
} from './common';

export const PROFORMA_STATUSES = ['draft', 'issued', 'accepted', 'rejected', 'expired'] as const;
export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

export const PROFORMA_STATUS_LABELS: Record<ProformaStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

/** Currencies a proforma can be raised in. Amounts are never summed across currencies. */
export const PROFORMA_CURRENCIES = ['USD', 'GHS'] as const;
export type ProformaCurrency = (typeof PROFORMA_CURRENCIES)[number];

export const PROFORMA_CURRENCY_LABELS: Record<ProformaCurrency, string> = {
  USD: 'US dollars (USD)',
  GHS: 'Ghana cedis (GHS)',
};

const percentage = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim() || '0')
    .refine((v) => /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(v), `${label} must be between 0 and 100.`);

export const proformaItemInputSchema = z.object({
  stockItemId: uuid.nullable().optional(),
  name: requiredText('Item name', 200),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Enter a quantity greater than zero.'),
  unit: requiredText('Unit', 30),
  unitPrice: moneyString('Unit price'),
});
export type ProformaItemInput = z.input<typeof proformaItemInputSchema>;

export const proformaInputSchema = z.object({
  issueDate: isoDate,
  currency: z.enum(PROFORMA_CURRENCIES),
  /** Set when the customer was picked from the client directory. */
  clientId: uuid.nullable().optional(),
  customerName: requiredText('Customer', 200),
  customerAddress: optionalText(500),
  customerEmail: optionalEmail,
  customerPhone: optionalPhone,
  /** VAT is fixed at zero for now; the API ignores any other value. */
  vatRate: percentage('VAT').optional(),
  taxRate: percentage('Tax'),
  notes: optionalText(2000),
  items: z.array(proformaItemInputSchema).min(1, 'Add at least one item.').max(200),
});
export type ProformaInput = z.input<typeof proformaInputSchema>;

export const proformaStatusSchema = z.object({ status: z.enum(PROFORMA_STATUSES) });

export const proformaListQuerySchema = listQuerySchema.extend({
  status: z.enum(PROFORMA_STATUSES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

/** Email composed from a proforma's detail view; sent as multipart with optional files. */
export const proformaEmailSchema = z.object({
  to: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter the recipient email address.')
    .max(254)
    .email('Enter a valid email address.'),
  subject: requiredText('Subject', 200),
  body: requiredText('Message', 10_000),
  attachInvoice: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(true),
});
export type ProformaEmailInput = z.input<typeof proformaEmailSchema>;

export const PROFORMA_EMAIL_MAX_FILES = 5;
export const PROFORMA_EMAIL_MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface ProformaTotals {
  subtotal: string;
  vatAmount: string;
  taxAmount: string;
  total: string;
  amounts: string[];
}

/** One calculation shared by the form preview and the API, so they cannot disagree. */
export function calculateProformaTotals(
  items: { quantity: string | number; unitPrice: string | number }[],
  vatRate: string | number,
  taxRate: string | number,
): ProformaTotals {
  const amounts = items.map((i) => toDecimal(i.quantity).times(toDecimal(i.unitPrice)).toDecimalPlaces(2));
  const subtotal = amounts.reduce((a, b) => a.plus(b), toDecimal(0));
  const vat = subtotal.times(toDecimal(vatRate)).div(100).toDecimalPlaces(2);
  const tax = subtotal.times(toDecimal(taxRate)).div(100).toDecimalPlaces(2);
  return {
    subtotal: toMoneyString(subtotal),
    vatAmount: toMoneyString(vat),
    taxAmount: toMoneyString(tax),
    total: toMoneyString(subtotal.plus(vat).plus(tax)),
    amounts: amounts.map((a) => toMoneyString(a)),
  };
}

export interface ProformaItemDto {
  id: string;
  stockItemId: string | null;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
}

export interface ProformaDto {
  id: string;
  number: string;
  issueDate: string;
  currency: ProformaCurrency;
  clientId: string | null;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  vatRate: string;
  taxRate: string;
  subtotal: string;
  vatAmount: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  status: ProformaStatus;
  emailedAt: string | null;
  itemCount: number;
  items: ProformaItemDto[];
  /** First name of the person who prepared it. */
  preparedBy: string;
  /** Full name of the person who prepared it, printed on the PDF. */
  preparedByName: string;
  createdAt: string;
  updatedAt: string;
}

/** Customer suggestions for the proforma form: existing clients with their saved details. */
export interface ProformaCustomerOptionDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
}

/** Item suggestions for the proforma form: stock items with their selling price. */
export interface ProformaItemOptionDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: string;
}
