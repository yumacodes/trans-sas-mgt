import { z } from 'zod';
import {
  booleanQuery,
  listQuerySchema,
  moneyString,
  optionalMoneyString,
  optionalText,
  requiredText,
  uuid,
} from './common';
import type { BranchRef } from './branch';

export const TRACKING_MODES = ['none', 'serial', 'batch'] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export const TRACKING_MODE_LABELS: Record<TrackingMode, string> = {
  none: 'Quantity only',
  serial: 'Serial numbers',
  batch: 'Batch / lot',
};

export const UNITS_OF_MEASURE = ['unit', 'set', 'box', 'pack', 'pair', 'kit', 'roll', 'litre', 'kg'] as const;

/* ---------- Categories ---------- */

export const stockCategoryInputSchema = z.object({
  name: requiredText('Category name', 100),
  description: optionalText(300),
});
export type StockCategoryInput = z.input<typeof stockCategoryInputSchema>;

export interface StockCategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount: number;
}

/* ---------- Item images ---------- */

export const STOCK_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const STOCK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const STOCK_IMAGE_MAX_PER_ITEM = 6;

export interface StockItemImageDto {
  id: string;
  /** Short-lived signed URL; null when the stored object could not be signed. */
  url: string | null;
  originalName: string;
  sizeBytes: number;
  /** Lowest position is the image used as the item's thumbnail. */
  position: number;
  isPrimary: boolean;
  createdAt: string;
}

/* ---------- Items ---------- */

export const stockItemInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Item code is required.')
    .max(40)
    .regex(/^[A-Z0-9._/-]+$/, 'Use letters, numbers, dots, hyphens, slashes or underscores.'),
  name: requiredText('Item name', 200),
  description: optionalText(2000),
  categoryId: uuid.nullable().optional(),
  brand: optionalText(100),
  model: optionalText(100),
  unit: requiredText('Unit of measure', 20),
  purchaseCost: optionalMoneyString('Purchase cost'),
  sellingPrice: moneyString('Selling price'),
  reorderLevel: z.coerce
    .number({ invalid_type_error: 'Reorder level must be a number.' })
    .int('Reorder level must be a whole number.')
    .min(0, 'Reorder level must be zero or more.'),
  trackingMode: z.enum(TRACKING_MODES),
  warrantyMonths: z
    .union([z.coerce.number().int().min(0).max(240), z.literal('').transform(() => null), z.null()])
    .optional(),
  tracksExpiry: z.boolean().default(false),
});
export type StockItemInput = z.input<typeof stockItemInputSchema>;

export const stockItemStatusSchema = z.object({ isActive: z.boolean() });

export const stockItemListQuerySchema = listQuerySchema.extend({
  categoryId: uuid.optional(),
  isActive: booleanQuery,
  lowStock: booleanQuery,
});

export interface StockItemDto {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: { id: string; name: string } | null;
  brand: string | null;
  model: string | null;
  unit: string;
  /** Omitted (null) unless the requester holds stock_items.view_cost. */
  purchaseCost: string | null;
  sellingPrice: string;
  reorderLevel: number;
  trackingMode: TrackingMode;
  warrantyMonths: number | null;
  tracksExpiry: boolean;
  isActive: boolean;
  /** Sum of on-hand quantity across the branches visible to the requester. */
  quantityOnHand: string;
  isLowStock: boolean;
  /** Signed URL of the item's first image, for thumbnails. */
  primaryImageUrl: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Balances & movements (read side in Phase 2) ---------- */

export const STOCK_MOVEMENT_TYPES = [
  'opening_balance',
  'purchase_receipt',
  'sale_issue',
  'sale_return',
  'adjustment_in',
  'adjustment_out',
  'transfer_in',
  'transfer_out',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening_balance: 'Opening balance',
  purchase_receipt: 'Purchase receipt',
  sale_issue: 'Sale issue',
  sale_return: 'Sale return',
  adjustment_in: 'Adjustment (in)',
  adjustment_out: 'Adjustment (out)',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
};

export interface StockBalanceDto {
  id: string;
  item: { id: string; sku: string; name: string; unit: string; reorderLevel: number };
  branch: BranchRef;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  isLowStock: boolean;
  updatedAt: string;
}

export const stockBalanceListQuerySchema = listQuerySchema.extend({
  branchId: uuid.optional(),
  itemId: uuid.optional(),
  categoryId: uuid.optional(),
  lowStock: booleanQuery,
});

export interface StockMovementDto {
  id: string;
  type: StockMovementType;
  quantity: string;
  unitCost: string | null;
  branch: BranchRef;
  reference: string | null;
  note: string | null;
  actor: { id: string; fullName: string } | null;
  occurredAt: string;
}

export const stockMovementListQuerySchema = listQuerySchema.extend({
  branchId: uuid.optional(),
});
