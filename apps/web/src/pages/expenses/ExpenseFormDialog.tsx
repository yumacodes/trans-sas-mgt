import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  EXPENSE_KIND_LABELS,
  expenseUpdateSchema,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PROFORMA_CURRENCIES,
  PROFORMA_CURRENCY_LABELS,
  type ExpenseDto,
  type ExpenseKind,
  type ExpenseUpdateInput,
} from '@tsm/shared';
import { FormDialog } from '@/components/app/dialogs';
import { Field, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useBranchOptions } from '@/lib/queries';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';

type Output = z.output<typeof expenseUpdateSchema>;

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

/** What the counterparty field means for each kind. */
export const COUNTERPARTY_LABEL: Record<ExpenseKind, string> = {
  general: 'Paid to',
  tender_in: 'Received from',
  tender_out: 'Paid to',
};

function toFormValues(expense?: ExpenseDto | null): ExpenseUpdateInput {
  return {
    transactionDate: expense?.transactionDate ?? todayIso(),
    currency: expense?.currency ?? 'GHS',
    amount: expense?.amount ?? '',
    category: expense?.category ?? '',
    counterparty: expense?.counterparty ?? '',
    tenderReference: expense?.tenderReference ?? '',
    paymentMethod: expense?.paymentMethod ?? 'cash',
    paymentReference: expense?.paymentReference ?? '',
    description: expense?.description ?? '',
    branchId: expense?.branch?.id ?? null,
  };
}

interface Props {
  kind: ExpenseKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  expense?: ExpenseDto | null;
}

export function ExpenseFormDialog({ kind, open, onOpenChange, expense }: Props) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const branches = useBranchOptions();
  const listId = useId();
  const isEdit = Boolean(expense);
  const isTender = kind !== 'general';
  const label = EXPENSE_KIND_LABELS[kind];

  const categories = useQuery({
    queryKey: [...qk.expenses, 'categories', kind],
    queryFn: ({ signal }) => api.get<string[]>('/expenses/categories', { kind }, signal),
    enabled: open,
    staleTime: 60_000,
  });

  const form = useForm<ExpenseUpdateInput, unknown, Output>({
    resolver: zodForm(expenseUpdateSchema),
    defaultValues: toFormValues(expense),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(toFormValues(expense));
  }, [open, expense, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    // Close straight away; the save carries on in the background.
    onOpenChange(false);
    try {
      await run(
        () =>
          isEdit
            ? api.put<ExpenseDto>(`/expenses/${expense!.id}`, values)
            : api.post<ExpenseDto>('/expenses', { ...values, kind }, idem.keyFor({ ...values, kind })),
        {
          pending: isEdit ? 'Saving changes…' : `Recording ${label.toLowerCase()}…`,
          success: isEdit ? 'Record updated' : `${label} recorded`,
          optimistic: () => {
            const shown = {
              transactionDate: values.transactionDate,
              currency: values.currency,
              amount: values.amount,
              category: values.category,
              counterparty: values.counterparty ?? null,
              tenderReference: values.tenderReference ?? null,
              paymentMethod: values.paymentMethod,
              paymentReference: values.paymentReference ?? null,
              description: values.description ?? null,
            };
            return isEdit
              ? patchRecord<ExpenseDto>(queryClient, qk.expenses, expense!.id, shown)
              : insertRecord<ExpenseDto>(
                  queryClient,
                  [...qk.expenses, kind],
                  {
                    ...shown,
                    id: pendingId(),
                    number: '…',
                    kind,
                    status: 'pending',
                    statusReason: null,
                    branch: null,
                    recordedBy: '',
                    approvedBy: null,
                    approvedAt: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                  { kind },
                );
          },
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.expenses });
    } catch {
      // The error dialog already explained the failure.
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={isEdit ? `Edit ${expense!.number}` : `Record ${label.toLowerCase()}`}
      description={
        isEdit
          ? 'Only records awaiting approval can be edited.'
          : 'A reference number is assigned when the record is saved. It starts as pending approval.'
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <FormGrid>
            <Field label="Date" error={errors.transactionDate?.message} required>
              <Input type="date" {...form.register('transactionDate')} />
            </Field>
            <Field label="Category" error={errors.category?.message} required>
              <Input
                autoFocus
                list={listId}
                placeholder={isTender ? 'e.g. Bid security, Tender fee' : 'e.g. Fuel, Rent, Utilities'}
                {...form.register('category')}
              />
            </Field>
            <Field label="Currency" error={errors.currency?.message} required>
              <NativeSelect {...form.register('currency')}>
                {PROFORMA_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {PROFORMA_CURRENCY_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Amount" error={errors.amount?.message} required>
              <Input inputMode="decimal" placeholder="0.00" {...form.register('amount')} />
            </Field>
            <Field label={COUNTERPARTY_LABEL[kind]} error={errors.counterparty?.message}>
              <Input {...form.register('counterparty')} />
            </Field>
            {isTender && (
              <Field label="Tender reference" error={errors.tenderReference?.message}>
                <Input placeholder="e.g. GHS/MOH/2026/014" {...form.register('tenderReference')} />
              </Field>
            )}
            <Field label="Payment method" error={errors.paymentMethod?.message} required>
              <NativeSelect {...form.register('paymentMethod')}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Payment reference" error={errors.paymentReference?.message} hint="Cheque, transfer or receipt number.">
              <Input {...form.register('paymentReference')} />
            </Field>
            <Field label="Branch" error={errors.branchId?.message} hint="Leave empty for a company-wide record.">
              <NativeSelect {...form.register('branchId', { setValueAs: emptyToNull })}>
                <option value="">Company-wide</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
              <Textarea rows={3} {...form.register('description')} />
            </Field>
          </FormGrid>
          <datalist id={listId}>
            {categories.data?.map((c) => <option key={c} value={c} />)}
          </datalist>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : `Record ${label.toLowerCase()}`}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
