import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import {
  calculateProformaTotals,
  PROFORMA_CURRENCIES,
  PROFORMA_CURRENCY_LABELS,
  saleInputSchema,
  type SaleDto,
  type SaleInput,
} from '@tsm/shared';
import type { z } from 'zod';
import { useAuth } from '@/auth/AuthProvider';
import { BranchField } from '@/components/app/BranchControls';
import { CustomerInput, ItemNameInput } from '@/components/app/DocumentPickers';
import { FormDialog } from '@/components/app/dialogs';
import { Field, FormGrid, FormSection, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatMoney, todayIso } from '@/lib/format';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';

type SaleOutput = z.output<typeof saleInputSchema>;

const blankItem = { stockItemId: null, name: '', quantity: '1', unit: '', unitPrice: '' };

const blankForm = (): SaleInput => ({
  branchId: null,
  saleDate: todayIso(),
  dueDate: null,
  currency: 'USD',
  clientId: null,
  customerName: '',
  customerAddress: '',
  customerEmail: '',
  customerPhone: '',
  taxRate: '0',
  notes: '',
  items: [{ ...blankItem }],
});

const fromSale = (p: SaleDto): SaleInput => ({
  branchId: p.branch?.id ?? null,
  saleDate: p.saleDate,
  dueDate: p.dueDate,
  currency: p.currency,
  clientId: p.clientId,
  customerName: p.customerName,
  customerAddress: p.customerAddress ?? '',
  customerEmail: p.customerEmail ?? '',
  customerPhone: p.customerPhone ?? '',
  taxRate: p.taxRate,
  notes: p.notes ?? '',
  items: p.items.map((i) => ({
    stockItemId: i.stockItemId,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    unitPrice: i.unitPrice,
  })),
});

/** A decimal string safe for arithmetic; anything half-typed counts as zero in the preview. */
const numeric = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^\d+(\.\d+)?$/.test(s) ? s : '0';
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (sale: SaleDto) => void;
  /** Present when editing a draft sale. */
  sale?: SaleDto | null;
}

export function SaleFormDialog({ open, onOpenChange, onSaved, sale }: Props) {
  const isEdit = Boolean(sale);
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();

  const nextNumber = useQuery({
    queryKey: [...qk.sales, 'next-number'],
    queryFn: ({ signal }) => api.get<{ number: string }>('/sales/next-number', undefined, signal),
    enabled: open && !isEdit,
    staleTime: 0,
    gcTime: 0,
  });

  const form = useForm<SaleInput, unknown, SaleOutput>({
    resolver: zodForm(saleInputSchema),
    defaultValues: blankForm(),
  });
  const { errors, isDirty } = form.formState;
  const items = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open) form.reset(sale ? fromSale(sale) : blankForm());
  }, [open, sale, form]);

  const watched = form.watch();
  const lines = watched.items ?? [];
  const totals = calculateProformaTotals(
    lines.map((i) => ({ quantity: numeric(i?.quantity), unitPrice: numeric(i?.unitPrice) })),
    0,
    numeric(watched.taxRate),
  );
  const currency = watched.currency ?? 'USD';

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      const saved = await run(
        () =>
          isEdit
            ? api.put<SaleDto>(`/sales/${sale!.id}`, values)
            : api.post<SaleDto>('/sales', values, idem.keyFor(values)),
        {
          pending: isEdit ? 'Saving sale…' : 'Creating sale…',
          success: isEdit ? 'Sale updated' : 'Sale created',
          optimistic: () => {
            const sums = calculateProformaTotals(values.items, 0, values.taxRate);
            const shown = {
              saleDate: values.saleDate,
              dueDate: values.dueDate ?? null,
              currency: values.currency,
              clientId: values.clientId ?? null,
              customerName: values.customerName,
              customerAddress: values.customerAddress ?? null,
              customerEmail: values.customerEmail ?? null,
              customerPhone: values.customerPhone ?? null,
              taxRate: values.taxRate,
              subtotal: sums.subtotal,
              taxAmount: sums.taxAmount,
              total: sums.total,
              balance: sums.total,
              notes: values.notes ?? null,
              itemCount: values.items.length,
              items: values.items.map((item, index) => ({
                id: pendingId(),
                stockItemId: item.stockItemId ?? null,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                amount: sums.amounts[index]!,
              })),
            };
            return isEdit
              ? patchRecord<SaleDto>(queryClient, qk.sales, sale!.id, shown)
              : insertRecord<SaleDto>(queryClient, qk.sales, {
                  ...shown,
                  id: pendingId(),
                  number: nextNumber.data?.number ?? '…',
                  branch: null,
                  paidAmount: '0.00',
                  status: 'draft',
                  cancelReason: null,
                  proforma: null,
                  tender: null,
                  preparedBy: me?.user.fullName.trim() ?? '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
          },
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.sales });
      void queryClient.invalidateQueries({ queryKey: qk.clients });
      onSaved?.(saved);
    } catch {
      // The error dialog already explained the failure.
    }
  });

  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="xl"
      title={isEdit ? `Edit ${sale!.number}` : 'New sale'}
      description="Saved as a draft. Stock comes off only when you confirm the sale."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Customer details">
            <FormGrid>
              <Field label="Sale number" hint={isEdit ? undefined : 'Assigned when you save.'}>
                <Input readOnly value={isEdit ? sale!.number : (nextNumber.data?.number ?? '…')} className="bg-surface-muted font-mono" />
              </Field>
              <Field label="Sale date" error={errors.saleDate?.message} required>
                <Input type="date" {...form.register('saleDate')} />
              </Field>
              <Field label="Due date" error={errors.dueDate?.message}>
                <Input type="date" {...form.register('dueDate', { setValueAs: (v) => v || null })} />
              </Field>
              <BranchField
                registration={form.register('branchId', { setValueAs: (v) => v || null })}
                error={errors.branchId?.message}
                current={sale?.branch?.name}
              />
              <Field label="Customer" error={errors.customerName?.message} required className="sm:col-span-2">
                <Controller
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <CustomerInput
                      base="/sales"
                      value={field.value}
                      invalid={Boolean(errors.customerName)}
                      onChange={(text) => {
                        field.onChange(text);
                        // Typing a different name means this is no longer the picked client.
                        if (form.getValues('clientId')) form.setValue('clientId', null);
                      }}
                      onPick={(c) => {
                        form.setValue('customerName', c.name, { shouldDirty: true });
                        form.setValue('clientId', c.id, { shouldDirty: true });
                        form.setValue('customerAddress', c.address ?? '', { shouldDirty: true });
                        form.setValue('customerEmail', c.email ?? '', { shouldDirty: true });
                        form.setValue('customerPhone', c.phone ?? '', { shouldDirty: true });
                      }}
                    />
                  )}
                />
              </Field>
              <Field label="Address" error={errors.customerAddress?.message} className="sm:col-span-2">
                <Textarea rows={2} {...form.register('customerAddress')} />
              </Field>
              <Field label="Email" error={errors.customerEmail?.message}>
                <Input type="email" {...form.register('customerEmail')} />
              </Field>
              <Field label="Phone" error={errors.customerPhone?.message}>
                <Input type="tel" {...form.register('customerPhone')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Item details">
            <FormGrid className="sm:grid-cols-2">
              <Field label="Currency" error={errors.currency?.message} required>
                <NativeSelect {...form.register('currency')}>
                  {PROFORMA_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {PROFORMA_CURRENCY_LABELS[c]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Tax (%)" error={errors.taxRate?.message}>
                <Input inputMode="decimal" {...form.register('taxRate')} />
              </Field>
            </FormGrid>

            <div className="space-y-3">
              {items.fields.map((field, index) => {
                const e = errors.items?.[index];
                const amount = totals.amounts[index] ?? '0.00';
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-2 gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[minmax(0,3fr)_80px_90px_110px_110px_auto]"
                  >
                    <Field label="Item name" error={e?.name?.message} required className="col-span-2 sm:col-span-1">
                      <Controller
                        control={form.control}
                        name={`items.${index}.name`}
                        render={({ field: f }) => (
                          <ItemNameInput
                            base="/sales"
                            value={f.value}
                            invalid={Boolean(e?.name)}
                            onChange={(text) => {
                              f.onChange(text);
                              if (form.getValues(`items.${index}.stockItemId`)) {
                                form.setValue(`items.${index}.stockItemId`, null);
                              }
                            }}
                            onPick={(i) => {
                              const opts = { shouldDirty: true, shouldValidate: true };
                              form.setValue(`items.${index}.name`, i.name, opts);
                              form.setValue(`items.${index}.stockItemId`, i.id, opts);
                              form.setValue(`items.${index}.unit`, i.unit, opts);
                              form.setValue(`items.${index}.unitPrice`, i.sellingPrice, opts);
                            }}
                          />
                        )}
                      />
                    </Field>
                    <Field label="Quantity" error={e?.quantity?.message} required>
                      <Input inputMode="decimal" {...form.register(`items.${index}.quantity`)} />
                    </Field>
                    <Field label="Unit" error={e?.unit?.message} required>
                      <Input placeholder="pcs" {...form.register(`items.${index}.unit`)} />
                    </Field>
                    <Field label="Unit price" error={e?.unitPrice?.message} required>
                      <Input inputMode="decimal" {...form.register(`items.${index}.unitPrice`)} />
                    </Field>
                    <Field label="Amount">
                      <Input readOnly value={formatMoney(amount, currency)} className="bg-surface-muted text-right" />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove item ${index + 1}`}
                        disabled={items.fields.length === 1}
                        onClick={() => items.remove(index)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {itemsError && (
                <p role="alert" className="text-xs text-danger">
                  {itemsError}
                </p>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={() => items.append({ ...blankItem })}>
                <Plus aria-hidden /> Add item
              </Button>
            </div>

            <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd>{formatMoney(totals.subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tax ({numeric(watched.taxRate)}%)</dt>
                <dd>{formatMoney(totals.taxAmount, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatMoney(totals.total, currency)}</dd>
              </div>
            </dl>

            <Field label="Notes" error={errors.notes?.message}>
              <Textarea rows={2} placeholder="Delivery or payment terms" {...form.register('notes')} />
            </Field>
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : 'Create sale'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
