import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  paymentInputSchema,
  toDecimal,
  toMoneyString,
  type OpenSaleOptionDto,
  type PaymentDto,
  type PaymentInput,
  type SaleDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { FormDialog } from '@/components/app/dialogs';
import { Field, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatMoney, todayIso } from '@/lib/format';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';

type Output = z.output<typeof paymentInputSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when recording against a sale already open on screen. */
  sale?: SaleDto;
}

export function PaymentFormDialog({ open, onOpenChange, sale }: Props) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();

  const openSales = useQuery({
    queryKey: [...qk.payments, 'open-sales'],
    queryFn: ({ signal }) => api.get<OpenSaleOptionDto[]>('/payments/open-sales', undefined, signal),
    enabled: open && !sale,
    staleTime: 0,
  });
  const options: OpenSaleOptionDto[] = sale
    ? [{ id: sale.id, number: sale.number, customerName: sale.customerName, customerEmail: sale.customerEmail, currency: sale.currency, total: sale.total, balance: sale.balance }]
    : (openSales.data ?? []);

  const blank = (): PaymentInput => ({
    saleId: sale?.id ?? '',
    paymentDate: todayIso(),
    amount: sale?.balance ?? '',
    method: 'bank_transfer',
    externalReference: '',
    notes: '',
  });
  const [emailReceipt, setEmailReceipt] = useState(true);
  const form = useForm<PaymentInput, unknown, Output>({ resolver: zodForm(paymentInputSchema), defaultValues: blank() });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id]);

  const selected = options.find((o) => o.id === form.watch('saleId'));

  const onSubmit = form.handleSubmit(async (values) => {
    const target = options.find((o) => o.id === values.saleId);
    onOpenChange(false);
    try {
      const saved = await run(() => api.post<PaymentDto>('/payments', values, idem.keyFor(values)), {
        optimistic: () => {
          if (!target) return;
          const balance = toMoneyString(toDecimal(target.balance).minus(values.amount));
          const undoSale = patchRecord<SaleDto>(queryClient, qk.sales, target.id, {
            balance,
            paidAmount: toMoneyString(toDecimal(target.total).minus(balance)),
          });
          const undoPayment = insertRecord<PaymentDto>(queryClient, qk.payments, {
            id: pendingId(),
            number: '…',
            sale: { id: target.id, number: target.number, total: target.total, balance },
            branch: null,
            customerName: target.customerName,
            paymentDate: values.paymentDate,
            amount: values.amount,
            currency: target.currency,
            method: values.method,
            externalReference: values.externalReference ?? null,
            notes: values.notes ?? null,
            status: 'posted',
            reverseReason: null,
            reversedAt: null,
            recordedBy: me?.user.fullName ?? '',
            createdAt: new Date().toISOString(),
          });
          return () => {
            undoSale();
            undoPayment();
          };
        },
      });
      idem.reset();
      const email = target?.customerEmail;
      if (emailReceipt && email && saved) {
        const data = new FormData();
        data.set('to', email);
        data.set('subject', `Receipt ${saved.number}`);
        data.set(
          'body',
          `Dear ${saved.customerName},\n\nThank you for your payment of ${formatMoney(saved.amount, saved.currency)}. Your receipt ${saved.number} is attached.\n\nKind regards,\n${me?.user.fullName ?? ''}`,
        );
        data.set('attachInvoice', 'true');
        // A receipt that can't be emailed doesn't undo the payment; the error dialog says so.
        void run(() => api.upload(`/payments/${saved.id}/email`, data)).catch(() => undefined);
      }
      void queryClient.invalidateQueries({ queryKey: qk.payments });
      void queryClient.invalidateQueries({ queryKey: qk.sales });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
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
      title="Record payment"
      description="A payment received from a customer against a confirmed sale."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field
              label="Sale"
              error={errors.saleId?.message}
              required
              className="sm:col-span-2"
              hint={selected ? `Outstanding: ${formatMoney(selected.balance, selected.currency)}` : undefined}
            >
              <NativeSelect disabled={Boolean(sale)} {...form.register('saleId')}>
                {!sale && <option value="">Choose a sale</option>}
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} — {o.customerName} ({formatMoney(o.balance, o.currency)} owing)
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Amount" error={errors.amount?.message} required>
              <Input inputMode="decimal" className="tabular" {...form.register('amount')} />
            </Field>
            <Field label="Date" error={errors.paymentDate?.message} required>
              <Input type="date" {...form.register('paymentDate')} />
            </Field>
            <Field label="Method" error={errors.method?.message} required>
              <NativeSelect {...form.register('method')}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reference" error={errors.externalReference?.message} hint="Bank, cheque or mobile money reference.">
              <Input {...form.register('externalReference')} />
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('notes')} />
            </Field>
            {selected?.customerEmail && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={emailReceipt} onCheckedChange={(v) => setEmailReceipt(v === true)} />
                Email the receipt to {selected.customerEmail}
              </label>
            )}
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">Record payment</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
