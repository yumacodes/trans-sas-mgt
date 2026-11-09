import { z } from 'zod';
import { isoDate, listQuerySchema, moneyString, optionalText, requiredText, uuid } from './common';
import { PROFORMA_CURRENCIES, type ProformaCurrency } from './proforma';

/**
 * Expense transactions. General expenses, Tender-In and Tender-Out share one table but are
 * separate classifications: Tender-In is money received in connection with a tender and is
 * kept apart from customer receipts; Tender-Out is money paid out for a tender (fees, bonds).
 * How each is treated in the accounts is still to be confirmed by the company.
 */
export const EXPENSE_KINDS = ['general', 'tender_in', 'tender_out'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
  general: 'General expense',
  tender_in: 'Tender-In',
  tender_out: 'Tender-Out',
};

/** URL segment used for each kind, e.g. /expenses/tender-in. */
export const EXPENSE_KIND_SLUGS: Record<ExpenseKind, string> = {
  general: 'general',
  tender_in: 'tender-in',
  tender_out: 'tender-out',
};

/**
 * pending  → recorded, awaiting approval (editable)
 * approved → confirmed; counted in reports
 * rejected → declined by an approver
 * voided   → cancelled after approval; kept for the audit trail, never counted
 */
export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected', 'voided'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  voided: 'Voided',
};

/** Allowed status changes. Approve/reject need `expenses.approve`; voiding needs it too. */
export const EXPENSE_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['voided'],
  rejected: [],
  voided: [],
};

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  mobile_money: 'Mobile money',
  card: 'Card',
  other: 'Other',
};

export const expenseInputSchema = z.object({
  kind: z.enum(EXPENSE_KINDS),
  transactionDate: isoDate,
  currency: z.enum(PROFORMA_CURRENCIES),
  amount: moneyString('Amount', { allowZero: false }),
  category: requiredText('Category', 100),
  /** Who was paid, or who paid us. */
  counterparty: optionalText(200),
  /** Tender or opportunity reference this transaction belongs to (tender kinds). */
  tenderReference: optionalText(100),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentReference: optionalText(100),
  description: optionalText(2000),
  branchId: uuid.nullable().optional(),
});
export type ExpenseInput = z.input<typeof expenseInputSchema>;

/** Editing keeps the kind fixed. */
export const expenseUpdateSchema = expenseInputSchema.omit({ kind: true });
export type ExpenseUpdateInput = z.input<typeof expenseUpdateSchema>;

export const expenseStatusSchema = z.object({
  status: z.enum(EXPENSE_STATUSES),
  reason: optionalText(500),
});

export const expenseListQuerySchema = listQuerySchema.extend({
  kind: z.enum(EXPENSE_KINDS),
  status: z.enum(EXPENSE_STATUSES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export interface ExpenseDto {
  id: string;
  number: string;
  kind: ExpenseKind;
  transactionDate: string;
  currency: ProformaCurrency;
  amount: string;
  category: string;
  counterparty: string | null;
  tenderReference: string | null;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  description: string | null;
  status: ExpenseStatus;
  statusReason: string | null;
  branch: { id: string; code: string; name: string } | null;
  recordedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
