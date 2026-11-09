import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import {
  calculateProformaTotals,
  PROFORMA_CURRENCIES,
  PROFORMA_CURRENCY_LABELS,
  proformaInputSchema,
  type ProformaCustomerOptionDto,
  type ProformaDto,
  type ProformaInput,
  type ProformaItemOptionDto,
} from '@tsm/shared';
import type { z } from 'zod';
import { ComboInput } from '@/components/app/ComboInput';
import { FormDialog } from '@/components/app/dialogs';
import { applyServerErrors, Field, FormGrid, FormSection, useIdempotencyKey } from '@/components/app/form';
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

type ProformaOutput = z.output<typeof proformaInputSchema>;

const blankItem = { stockItemId: null, name: '', quantity: '1', unit: '', unitPrice: '' };

const blankForm = (): ProformaInput => ({
  issueDate: todayIso(),
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

/** A decimal string safe for arithmetic; anything half-typed counts as zero in the preview. */
const numeric = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^\d+(\.\d+)?$/.test(s) ? s : '0';
};

function useDebounced(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function CustomerInput({
  value,
  onChange,
  onPick,
  invalid,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (c: ProformaCustomerOptionDto) => void;
  invalid?: boolean;
}) {
  const q = useDebounced(value);
  const options = useQuery({
    queryKey: [...qk.proformas, 'customers', q],
    queryFn: ({ signal }) => api.get<ProformaCustomerOptionDto[]>('/proformas/customers', { q }, signal),
  });
  return (
    <ComboInput
      aria-invalid={invalid}
      value={value}
      onChange={onChange}
      options={options.data ?? []}
      loading={options.isLoading}
      getKey={(c) => c.id}
      onSelect={onPick}
      placeholder="Search existing customers or type a new name"
      emptyText="No existing customer matches. Keep typing to add a new one."
      renderOption={(c) => (
        <>
          <span className="font-medium">{c.name}</span> <span className="text-xs text-ink-subtle">{c.code}</span>
        </>
      )}
    />
  );
}

function ItemNameInput({
  value,
  onChange,
  onPick,
  invalid,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (i: ProformaItemOptionDto) => void;
  invalid?: boolean;
}) {
  const q = useDebounced(value);
  const options = useQuery({
    queryKey: [...qk.proformas, 'items', q],
    queryFn: ({ signal }) => api.get<ProformaItemOptionDto[]>('/proformas/items', { q }, signal),
  });
  return (
    <ComboInput
      aria-invalid={invalid}
      value={value}
      onChange={onChange}
      options={options.data ?? []}
      loading={options.isLoading}
      getKey={(i) => i.id}
      onSelect={onPick}
      placeholder="Select or type an item"
      emptyText="Not in stock items. Keep typing to enter it manually."
      renderOption={(i) => (
        <>
          <span className="font-medium">{i.name}</span> <span className="text-xs text-ink-subtle">{i.sku}</span>
        </>
      )}
    />
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (proforma: ProformaDto) => void;
}

export function ProformaFormDialog({ open, onOpenChange, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();

  const nextNumber = useQuery({
    queryKey: [...qk.proformas, 'next-number'],
    queryFn: ({ signal }) => api.get<{ number: string }>('/proformas/next-number', undefined, signal),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  const form = useForm<ProformaInput, unknown, ProformaOutput>({
    resolver: zodForm(proformaInputSchema),
    defaultValues: blankForm(),
  });
  const { errors, isDirty } = form.formState;
  const items = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open) form.reset(blankForm());
  }, [open, form]);

  const watched = form.watch();
  const lines = watched.items ?? [];
  const totals = calculateProformaTotals(
    lines.map((i) => ({ quantity: numeric(i?.quantity), unitPrice: numeric(i?.unitPrice) })),
    0,
    numeric(watched.taxRate),
  );
  const currency = watched.currency ?? 'USD';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await run(() => api.post<ProformaDto>('/proformas', values, idem.keyFor(values)), {
        pending: 'Creating proforma…',
        success: 'Proforma created',
      });
      idem.reset();
      await queryClient.invalidateQueries({ queryKey: qk.proformas });
      void queryClient.invalidateQueries({ queryKey: qk.clients });
      form.reset(blankForm());
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="xl"
      title="New proforma"
      description="A proforma is a quotation. It does not change stock or count as a sale."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Customer details">
            <FormGrid>
              <Field label="Invoice number" hint="Assigned when you save.">
                <Input readOnly value={nextNumber.data?.number ?? '…'} className="bg-surface-muted font-mono" />
              </Field>
              <Field label="Invoice date" error={errors.issueDate?.message} required>
                <Input type="date" {...form.register('issueDate')} />
              </Field>
              <Field label="Customer" error={errors.customerName?.message} required className="sm:col-span-2">
                <Controller
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <CustomerInput
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
                <dt className="text-ink-muted">VAT (0%)</dt>
                <dd>{formatMoney(totals.vatAmount, currency)}</dd>
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
              <Textarea rows={2} placeholder="Validity, delivery or payment terms" {...form.register('notes')} />
            </Field>
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">Create proforma</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
