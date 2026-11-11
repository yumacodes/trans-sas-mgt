import { z } from 'zod';
import { PAYMENT_METHODS, type PaymentMethod } from './expense';
import { isoDate, listQuerySchema, moneyString, optionalText, requiredText, uuid } from './common';
import { proformaInputSchema, type ProformaCurrency } from './proforma';

/**
 * Sales, waybills and customer payments.
 *
 * Stock policy: confirming a sale issues its stock, once. A waybill linked to a sale only
 * records the delivery. A waybill with no sale issues its stock when it is dispatched.
 */

type BranchRef = { id: string; code: string; name: string };
type DocRef = { id: string; number: string };

/* ---------- Sales ---------- */

export const SALE_STATUSES = ['draft', 'confirmed', 'cancelled'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export const saleInputSchema = proformaInputSchema
  .omit({ issueDate: true, vatRate: true })
  .extend({ saleDate: isoDate, dueDate: isoDate.nullable().optional() });
export type SaleInput = z.input<typeof saleInputSchema>;

export const saleCancelSchema = z.object({ reason: requiredText('Reason', 500) });

export const saleListQuerySchema = listQuerySchema.extend({
  status: z.enum(SALE_STATUSES).optional(),
  branchId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export interface SaleItemDto {
  id: string;
  /** Null for a line with no stock item, such as a service; it never moves stock. */
  stockItemId: string | null;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
}

export interface SaleDto {
  id: string;
  number: string;
  saleDate: string;
  dueDate: string | null;
  currency: ProformaCurrency;
  branch: BranchRef | null;
  clientId: string | null;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  taxRate: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  /** Sum of posted payments. */
  paidAmount: string;
  /** Total less posted payments. */
  balance: string;
  notes: string | null;
  status: SaleStatus;
  cancelReason: string | null;
  proforma: DocRef | null;
  tender: DocRef | null;
  itemCount: number;
  items: SaleItemDto[];
  preparedBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Waybills ---------- */

export const WAYBILL_STATUSES = ['draft', 'dispatched', 'delivered', 'cancelled'] as const;
export type WaybillStatus = (typeof WAYBILL_STATUSES)[number];
export const WAYBILL_STATUS_LABELS: Record<WaybillStatus, string> = {
  draft: 'Draft',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const quantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Enter a quantity greater than zero.');

export const waybillItemInputSchema = z.object({
  saleItemId: uuid.nullable().optional(),
  stockItemId: uuid.nullable().optional(),
  name: requiredText('Item name', 200),
  quantity,
  unit: requiredText('Unit', 30),
});

export const waybillInputSchema = z.object({
  branchId: uuid.nullable().optional(),
  saleId: uuid.nullable().optional(),
  clientId: uuid.nullable().optional(),
  recipientName: requiredText('Recipient', 200),
  deliveryAddress: optionalText(500),
  deliveryDate: isoDate,
  carrier: optionalText(200),
  vehicleNumber: optionalText(50),
  notes: optionalText(2000),
  items: z.array(waybillItemInputSchema).min(1, 'Add at least one item.').max(200),
});
export type WaybillInput = z.input<typeof waybillInputSchema>;

export const waybillDeliverSchema = z.object({ receivedBy: requiredText('Received by', 200) });

export const waybillListQuerySchema = listQuerySchema.extend({
  status: z.enum(WAYBILL_STATUSES).optional(),
  branchId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export interface WaybillItemDto {
  id: string;
  saleItemId: string | null;
  stockItemId: string | null;
  name: string;
  quantity: string;
  unit: string;
}

export interface WaybillDto {
  id: string;
  number: string;
  branch: BranchRef | null;
  sale: DocRef | null;
  clientId: string | null;
  recipientName: string;
  deliveryAddress: string | null;
  deliveryDate: string;
  carrier: string | null;
  vehicleNumber: string | null;
  receivedBy: string | null;
  notes: string | null;
  status: WaybillStatus;
  /** True while this waybill itself has taken stock off, which only a waybill with no sale does. */
  stockIssued: boolean;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  itemCount: number;
  items: WaybillItemDto[];
  preparedBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Payments ---------- */

export const PAYMENT_STATUSES = ['posted', 'reversed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  posted: 'Posted',
  reversed: 'Reversed',
};

export const paymentInputSchema = z.object({
  saleId: uuid,
  paymentDate: isoDate,
  amount: moneyString('Amount', { allowZero: false }),
  method: z.enum(PAYMENT_METHODS),
  externalReference: optionalText(100),
  notes: optionalText(2000),
});
export type PaymentInput = z.input<typeof paymentInputSchema>;

export const paymentReverseSchema = z.object({ reason: requiredText('Reason', 500) });

export const paymentListQuerySchema = listQuerySchema.extend({
  status: z.enum(PAYMENT_STATUSES).optional(),
  branchId: uuid.optional(),
  saleId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export interface PaymentDto {
  id: string;
  number: string;
  sale: DocRef & { total: string; balance: string };
  branch: BranchRef | null;
  customerName: string;
  paymentDate: string;
  amount: string;
  currency: ProformaCurrency;
  method: PaymentMethod;
  externalReference: string | null;
  notes: string | null;
  status: PaymentStatus;
  reverseReason: string | null;
  reversedAt: string | null;
  recordedBy: string;
  createdAt: string;
}

/** A confirmed sale with money still owing, for the payment form. */
export interface OpenSaleOptionDto {
  id: string;
  number: string;
  customerName: string;
  customerEmail: string | null;
  currency: ProformaCurrency;
  total: string;
  balance: string;
}
