import { z } from 'zod';
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
import { PROFORMA_CURRENCIES, type ProformaCurrency } from './proforma';

/**
 * Suppliers and purchases. A purchase never changes stock by itself: stock rises only when
 * goods are received against it, and only by what was actually received.
 */

/* ---------- Suppliers ---------- */

export const supplierInputSchema = z.object({
  name: requiredText('Supplier name', 200),
  contactPerson: optionalText(120),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalText(500),
  taxId: optionalText(60),
  notes: optionalText(2000),
});
export type SupplierInput = z.input<typeof supplierInputSchema>;

export const supplierStatusSchema = z.object({ isActive: z.boolean() });

export const supplierListQuerySchema = listQuerySchema.extend({
  isActive: z.enum(['true', 'false']).optional(),
});

export interface SupplierDto {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Purchases ---------- */

export const PURCHASE_STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

const quantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Enter a quantity greater than zero.');

export const purchaseItemInputSchema = z.object({
  /** Required: received goods go into this item's stock. */
  stockItemId: uuid,
  name: requiredText('Item name', 200),
  quantity,
  unit: requiredText('Unit', 30),
  unitCost: moneyString('Unit cost'),
});

export const purchaseInputSchema = z.object({
  branchId: uuid.nullable().optional(),
  supplierId: uuid,
  purchaseDate: isoDate,
  expectedDate: isoDate.nullable().optional(),
  supplierReference: optionalText(100),
  currency: z.enum(PROFORMA_CURRENCIES),
  taxRate: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim() || '0')
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Enter a percentage from 0 to 100.'),
  notes: optionalText(2000),
  items: z.array(purchaseItemInputSchema).min(1, 'Add at least one item.').max(200),
});
export type PurchaseInput = z.input<typeof purchaseInputSchema>;

export const purchaseReceiveSchema = z.object({
  receivedDate: isoDate,
  note: optionalText(500),
  items: z
    .array(z.object({ purchaseItemId: uuid, quantity }))
    .min(1, 'Enter at least one quantity received.'),
});
export type PurchaseReceiveInput = z.input<typeof purchaseReceiveSchema>;

export const purchaseReorderSchema = z.object({
  supplierId: uuid,
  branchId: uuid.nullable().optional(),
});

export const purchaseListQuerySchema = listQuerySchema.extend({
  status: z.enum(PURCHASE_STATUSES).optional(),
  branchId: uuid.optional(),
  supplierId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export interface PurchaseItemDto {
  id: string;
  stockItemId: string;
  name: string;
  quantity: string;
  receivedQuantity: string;
  unit: string;
  unitCost: string;
  amount: string;
}

export interface GoodsReceiptDto {
  id: string;
  receivedDate: string;
  note: string | null;
  receivedBy: string;
  lines: { name: string; quantity: string; unit: string }[];
  createdAt: string;
}

export interface PurchaseDto {
  id: string;
  number: string;
  branch: { id: string; code: string; name: string } | null;
  supplier: { id: string; code: string; name: string };
  purchaseDate: string;
  expectedDate: string | null;
  supplierReference: string | null;
  currency: ProformaCurrency;
  taxRate: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  status: PurchaseStatus;
  itemCount: number;
  items: PurchaseItemDto[];
  receipts: GoodsReceiptDto[];
  preparedBy: string;
  createdAt: string;
  updatedAt: string;
}
