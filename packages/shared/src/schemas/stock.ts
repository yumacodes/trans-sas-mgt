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
  /** List the item on the public website. Omitted on update = leave unchanged. */
  showOnWebsite: z.boolean().optional(),
});
export type StockItemInput = z.input<typeof stockItemInputSchema>;

export const stockItemStatusSchema = z.object({ isActive: z.boolean() });

export const STOCK_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type StockApprovalStatus = (typeof STOCK_APPROVAL_STATUSES)[number];
export const STOCK_APPROVAL_LABELS: Record<StockApprovalStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const stockItemRejectSchema = z.object({ reason: requiredText('Reason', 500) });

export const stockItemListQuerySchema = listQuerySchema.extend({
  categoryId: uuid.optional(),
  approvalStatus: z.enum(STOCK_APPROVAL_STATUSES).optional(),
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
  /** Listed on the public website (shown there only while active and approved). */
  showOnWebsite: boolean;
  approvalStatus: StockApprovalStatus;
  rejectionReason: string | null;
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

/* ---------- Adjustments & transfers ---------- */

/**
 * Why on-hand stock is corrected outside a purchase, sale or delivery. Each reason fixes
 * the direction it may be used in, so a "damaged" write-off can't add stock.
 */
export const STOCK_ADJUSTMENT_REASONS = [
  'count_correction',
  'damaged',
  'expired',
  'lost_stolen',
  'found',
  'other',
] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export const STOCK_ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  count_correction: 'Stock count correction',
  damaged: 'Damaged',
  expired: 'Expired',
  lost_stolen: 'Lost or stolen',
  found: 'Found / recovered',
  other: 'Other (describe in the note)',
};

export const STOCK_ADJUSTMENT_DIRECTIONS = ['increase', 'decrease'] as const;
export type StockAdjustmentDirection = (typeof STOCK_ADJUSTMENT_DIRECTIONS)[number];

/** Directions each reason allows. */
export const STOCK_ADJUSTMENT_REASON_DIRECTIONS: Record<StockAdjustmentReason, readonly StockAdjustmentDirection[]> = {
  count_correction: ['increase', 'decrease'],
  damaged: ['decrease'],
  expired: ['decrease'],
  lost_stolen: ['decrease'],
  found: ['increase'],
  other: ['increase', 'decrease'],
};

const stockQuantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,12}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Enter a quantity greater than zero.');

export const stockAdjustmentInputSchema = z
  .object({
    itemId: z.string().uuid('Choose an item.'),
    branchId: z.string().uuid('Choose a branch.'),
    direction: z.enum(STOCK_ADJUSTMENT_DIRECTIONS, { errorMap: () => ({ message: 'Choose increase or decrease.' }) }),
    quantity: stockQuantity,
    reason: z.enum(STOCK_ADJUSTMENT_REASONS, { errorMap: () => ({ message: 'Choose a reason.' }) }),
    /** Only used for increases; decreases are costed at the item's current cost. */
    unitCost: optionalMoneyString('Unit cost'),
    note: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.reason === 'other' && !v.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Describe the reason for this adjustment.' });
    }
    if (!STOCK_ADJUSTMENT_REASON_DIRECTIONS[v.reason].includes(v.direction)) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message:
          v.direction === 'increase'
            ? `"${STOCK_ADJUSTMENT_REASON_LABELS[v.reason]}" can only remove stock.`
            : `"${STOCK_ADJUSTMENT_REASON_LABELS[v.reason]}" can only add stock.`,
      });
    }
  });
export type StockAdjustmentInput = z.input<typeof stockAdjustmentInputSchema>;

export const stockTransferInputSchema = z
  .object({
    fromBranchId: z.string().uuid('Choose the branch the stock leaves.'),
    toBranchId: z.string().uuid('Choose the branch receiving the stock.'),
    items: z
      .array(z.object({ itemId: z.string().uuid('Choose an item.'), quantity: stockQuantity }))
      .min(1, 'Add at least one item.')
      .max(100, 'Transfer up to 100 items at a time.'),
    note: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.fromBranchId && v.fromBranchId === v.toBranchId) {
      ctx.addIssue({ code: 'custom', path: ['toBranchId'], message: 'Choose a different branch from the one the stock leaves.' });
    }
    const seen = new Set<string>();
    v.items.forEach((line, index) => {
      if (!line.itemId) return;
      if (seen.has(line.itemId)) {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'itemId'], message: 'This item is already on the transfer.' });
      }
      seen.add(line.itemId);
    });
  });
export type StockTransferInput = z.input<typeof stockTransferInputSchema>;

/** Result of an adjustment or transfer: its reference and the balances it changed. */
export interface StockOperationResultDto {
  reference: string;
  balances: StockBalanceDto[];
}
