import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type { z } from 'zod';
import {
  calculateTenderTotals,
  PROFORMA_CURRENCIES,
  PROFORMA_CURRENCY_LABELS,
  tenderInputSchema,
  type TenderDto,
  type TenderInput,
} from '@tsm/shared';
import { FormDialog } from '@/components/app/dialogs';
import { CustomerInput, ItemNameInput } from '@/components/app/DocumentPickers';
import { Field, FormGrid, FormSection, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatMoney, todayIso } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';

type Output = z.output<typeof tenderInputSchema>;

const BASE = '/tenders';

const blankItem = {
  stockItemId: null,
  description: '',
  quantity: '1',
  unit: '',
  unitPrice: '',
  countryOfOrigin: '',
  manufacturer: '',
  brand: '',
  expiryDate: '',
};

function toFormValues(t?: TenderDto | null): TenderInput {
  if (!t) {
    return {
      scheduleDate: todayIso(),
      tenderReference: '',
      submissionDeadline: null,
      clientId: null,
      customerName: '',
      customerAddress: '',
      lot: '',
      currency: 'GHS',
      taxLabel: 'VAT + NHIL',
      taxRate: '20',
      notes: '',
      items: [{ ...blankItem }],
    };
  }
  return {
    scheduleDate: t.scheduleDate,
    tenderReference: t.tenderReference ?? '',
    submissionDeadline: t.submissionDeadline,
    clientId: t.clientId,
    customerName: t.customerName,
    customerAddress: t.customerAddress ?? '',
    lot: t.lot ?? '',
    currency: t.currency,
    taxLabel: t.taxLabel,
    taxRate: String(Number(t.taxRate)),
    notes: t.notes ?? '',
    items: t.items.map((i) => ({
      stockItemId: i.stockItemId,
      description: i.description,
      quantity: String(Number(i.quantity)),
      unit: i.unit,
      unitPrice: i.unitPrice,
      countryOfOrigin: i.countryOfOrigin ?? '',
      manufacturer: i.manufacturer ?? '',
      brand: i.brand ?? '',
      expiryDate: i.expiryDate ?? '',
    })),
  };
}

/** A decimal string safe for arithmetic; anything half-typed counts as zero in the preview. */
const numeric = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^\d+(\.\d+)?$/.test(s) ? s : '0';
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing a draft. */
  tender?: TenderDto | null;
  onSaved?: (tender: TenderDto) => void;
}

export function TenderFormDialog({ open, onOpenChange, tender, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const isEdit = Boolean(tender);

  const nextNumber = useQuery({
    queryKey: [...qk.tenders, 'next-number'],
    queryFn: ({ signal }) => api.get<{ number: string }>(`${BASE}/next-number`, undefined, signal),
    enabled: open && !isEdit,
    staleTime: 0,
    gcTime: 0,
  });

  const form = useForm<TenderInput, unknown, Output>({
    resolver: zodForm(tenderInputSchema),
    defaultValues: toFormValues(tender),
  });
  const { errors, isDirty } = form.formState;
  const items = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open) form.reset(toFormValues(tender));
  }, [open, tender, form]);

  const watched = form.watch();
  const totals = calculateTenderTotals(
    (watched.items ?? []).map((i) => ({ quantity: numeric(i?.quantity), unitPrice: numeric(i?.unitPrice) })),
    numeric(watched.taxRate),
  );
  const currency = watched.currency ?? 'GHS';
  const taxName = watched.taxLabel?.trim() || 'Tax';

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      const saved = await run(
        () =>
          isEdit
            ? api.put<TenderDto>(`${BASE}/${tender!.id}`, values)
            : api.post<TenderDto>(BASE, values, idem.keyFor(values)),
        {
          pending: isEdit ? 'Saving price schedule…' : 'Creating price schedule…',
          success: isEdit ? 'Price schedule updated' : 'Price schedule created',
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.tenders });
      void queryClient.invalidateQueries({ queryKey: qk.clients });
      onSaved?.(saved);
    } catch {
      // The toast already explained the failure.
    }
  });

  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="xl"
      title={isEdit ? `Edit ${tender!.number}` : 'New price schedule'}
      description="A price schedule is what you submit for a tender. It does not change stock or count as a sale."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Tender details">
            <FormGrid>
              <Field label="Schedule number" hint={isEdit ? undefined : 'Assigned when you save.'}>
                <Input
                  readOnly
                  value={isEdit ? tender!.number : (nextNumber.data?.number ?? '…')}
                  className="bg-surface-muted font-mono"
                />
              </Field>
              <Field label="Date" error={errors.scheduleDate?.message} required>
                <Input type="date" {...form.register('scheduleDate')} />
              </Field>
              <Field label="Tender reference (Your Ref)" error={errors.tenderReference?.message}>
                <Input placeholder="e.g. MOH/2026/PQ/SDC/01" {...form.register('tenderReference')} />
              </Field>
              <Field label="Submission deadline" error={errors.submissionDeadline?.message}>
                <Input
                  type="date"
                  {...form.register('submissionDeadline', { setValueAs: (v) => (v === '' ? null : v) })}
                />
              </Field>
              <Field label="Lot" error={errors.lot?.message} hint="e.g. 2 DRESSING ITEMS" className="sm:col-span-2">
                <Input {...form.register('lot')} />
              </Field>
              <Field label="To (procuring organisation)" error={errors.customerName?.message} required className="sm:col-span-2">
                <Controller
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <CustomerInput
                      base={BASE}
                      value={field.value}
                      invalid={Boolean(errors.customerName)}
                      onChange={(text) => {
                        field.onChange(text);
                        if (form.getValues('clientId')) form.setValue('clientId', null);
                      }}
                      onPick={(c) => {
                        form.setValue('customerName', c.name, { shouldDirty: true });
                        form.setValue('clientId', c.id, { shouldDirty: true });
                        form.setValue('customerAddress', c.address ?? '', { shouldDirty: true });
                      }}
                    />
                  )}
                />
              </Field>
              <Field label="Address" error={errors.customerAddress?.message} className="sm:col-span-2">
                <Textarea rows={2} {...form.register('customerAddress')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Items">
            <FormGrid className="sm:grid-cols-3">
              <Field label="Currency" error={errors.currency?.message} required>
                <NativeSelect {...form.register('currency')}>
                  {PROFORMA_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {PROFORMA_CURRENCY_LABELS[c]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Tax name" error={errors.taxLabel?.message} required>
                <Input {...form.register('taxLabel')} />
              </Field>
              <Field label="Tax (%)" error={errors.taxRate?.message} required>
                <Input inputMode="decimal" {...form.register('taxRate')} />
              </Field>
            </FormGrid>

            <div className="space-y-3">
              {items.fields.map((field, index) => {
                const e = errors.items?.[index];
                return (
                  <div key={field.id} className="space-y-3 rounded-2xl border border-border p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,3fr)_80px_90px_110px_130px_auto]">
                      <Field label={`Item ${index + 1}`} error={e?.description?.message} required className="col-span-2 sm:col-span-1">
                        <Controller
                          control={form.control}
                          name={`items.${index}.description`}
                          render={({ field: f }) => (
                            <ItemNameInput
                              base={BASE}
                              value={f.value}
                              invalid={Boolean(e?.description)}
                              onChange={(text) => {
                                f.onChange(text);
                                if (form.getValues(`items.${index}.stockItemId`)) {
                                  form.setValue(`items.${index}.stockItemId`, null);
                                }
                              }}
                              onPick={(i) => {
                                const opts = { shouldDirty: true, shouldValidate: true };
                                form.setValue(`items.${index}.description`, i.name, opts);
                                form.setValue(`items.${index}.stockItemId`, i.id, opts);
                                form.setValue(`items.${index}.unit`, i.unit, opts);
                                form.setValue(`items.${index}.unitPrice`, i.sellingPrice, opts);
                              }}
                            />
                          )}
                        />
                      </Field>
                      <Field label="Qty" error={e?.quantity?.message} required>
                        <Input inputMode="decimal" {...form.register(`items.${index}.quantity`)} />
                      </Field>
                      <Field label="Unit" error={e?.unit?.message} required>
                        <Input placeholder="pcs" {...form.register(`items.${index}.unit`)} />
                      </Field>
                      <Field label="Unit price" error={e?.unitPrice?.message} required>
                        <Input inputMode="decimal" {...form.register(`items.${index}.unitPrice`)} />
                      </Field>
                      <Field label={`Total incl. ${taxName}`}>
                        <Input
                          readOnly
                          value={formatMoney(totals.amountsWithTax[index] ?? '0', currency)}
                          className="bg-surface-muted text-right"
                        />
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
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Field label="Country of origin" error={e?.countryOfOrigin?.message}>
                        <Input {...form.register(`items.${index}.countryOfOrigin`)} />
                      </Field>
                      <Field label="Manufacturer" error={e?.manufacturer?.message}>
                        <Input {...form.register(`items.${index}.manufacturer`)} />
                      </Field>
                      <Field label="Brand" error={e?.brand?.message}>
                        <Input {...form.register(`items.${index}.brand`)} />
                      </Field>
                      <Field label="Expiry" error={e?.expiryDate?.message}>
                        <Input placeholder="e.g. 10.2026" {...form.register(`items.${index}.expiryDate`)} />
                      </Field>
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
                <dt className="text-ink-muted">
                  {taxName} ({numeric(watched.taxRate)}%)
                </dt>
                <dd>{formatMoney(totals.taxAmount, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Grand total</dt>
                <dd>{formatMoney(totals.total, currency)}</dd>
              </div>
            </dl>

            <Field label="Notes" error={errors.notes?.message}>
              <Textarea rows={2} placeholder="Delivery, validity or warranty terms" {...form.register('notes')} />
            </Field>
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : 'Create price schedule'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
