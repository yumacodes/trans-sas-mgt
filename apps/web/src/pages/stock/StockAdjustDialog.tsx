import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  STOCK_ADJUSTMENT_REASONS,
  STOCK_ADJUSTMENT_REASON_DIRECTIONS,
  STOCK_ADJUSTMENT_REASON_LABELS,
  stockAdjustmentInputSchema,
  toDecimal,
  type StockAdjustmentInput,
  type StockOperationResultDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { FormDialog } from '@/components/app/dialogs';
import { ItemNameInput } from '@/components/app/DocumentPickers';
import { applyServerErrors, Field, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { useKeepInput } from '@/components/app/useKeepInput';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatQuantity } from '@/lib/format';
import { useBranchOptions } from '@/lib/queries';
import { zodForm } from '@/lib/zodForm';
import {
  STOCK_PICKER_BASE,
  useAvailableQuantity,
  useInvalidateStock,
  type StockTarget,
} from './stockOperations';

type Output = z.output<typeof stockAdjustmentInputSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the item and branch, e.g. when opened from a balance row. */
  target?: StockTarget | null;
}

/** Records a reasoned correction to one item's on-hand stock at one branch. */
export function StockAdjustDialog({ open, onOpenChange, target }: Props) {
  const { can } = useAuth();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const recovery = useKeepInput();
  const invalidate = useInvalidateStock();
  const branches = useBranchOptions();
  const branchList = branches.data ?? [];
  const [picked, setPicked] = useState({ name: '', unit: '' });

  const blank = (): StockAdjustmentInput => ({
    itemId: target?.itemId ?? '',
    branchId: target?.branchId ?? (branchList.length === 1 ? branchList[0]!.id : ''),
    direction: 'decrease',
    quantity: '',
    reason: 'count_correction',
    unitCost: '',
    note: '',
  });
  const form = useForm<StockAdjustmentInput, unknown, Output>({
    resolver: zodForm(stockAdjustmentInputSchema),
    defaultValues: blank(),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open && !recovery.restoring()) {
      form.reset(blank());
      setPicked({ name: target?.itemName ?? '', unit: target?.unit ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  // A single-branch user gets their branch filled in once the options arrive.
  useEffect(() => {
    if (open && branchList.length === 1 && !form.getValues('branchId')) {
      form.setValue('branchId', branchList[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchList.length]);

  const itemId = form.watch('itemId');
  const branchId = form.watch('branchId');
  const direction = form.watch('direction');
  const reason = form.watch('reason');
  const quantity = form.watch('quantity');
  const available = useAvailableQuantity(itemId || undefined, branchId || undefined);
  const branchName = branchList.find((b) => b.id === branchId)?.name;
  const reasons = STOCK_ADJUSTMENT_REASONS.filter((r) =>
    STOCK_ADJUSTMENT_REASON_DIRECTIONS[r].includes(direction),
  );

  // Keep the reason valid for the chosen direction.
  useEffect(() => {
    if (!STOCK_ADJUSTMENT_REASON_DIRECTIONS[reason].includes(direction)) {
      form.setValue('reason', 'count_correction', { shouldDirty: true });
    }
  }, [direction, reason, form]);

  let projected: string | null = null;
  if (available.data !== undefined && /^\d+(\.\d+)?$/.test(String(quantity ?? '').trim())) {
    const current = toDecimal(available.data);
    const change = toDecimal(String(quantity).trim());
    projected = (
      direction === 'increase' ? current.plus(change) : current.minus(change)
    ).toString();
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: Output =
      values.direction === 'increase' ? values : { ...values, unitCost: null };
    onOpenChange(false);
    try {
      await run(
        () =>
          api.post<StockOperationResultDto>(
            '/stock-balances/adjustments',
            payload,
            idem.keyFor(payload),
          ),
        { success: (r) => `Stock adjusted · ${r.reference}` },
      );
      idem.reset();
      invalidate();
    } catch (error) {
      // Reopen with what was typed, and the problem shown on its field.
      recovery.keepNextOpen();
      onOpenChange(true);
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title="Adjust stock"
      description="Correct the quantity on hand at one branch. The change is recorded in the stock movement ledger with its reason."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field label="Item" error={errors.itemId?.message} required className="sm:col-span-2">
              <ItemNameInput
                base={STOCK_PICKER_BASE}
                value={picked.name}
                invalid={Boolean(errors.itemId)}
                placeholder="Search item code or name"
                onChange={(text) => {
                  setPicked({ name: text, unit: '' });
                  form.setValue('itemId', '', { shouldDirty: true });
                }}
                onPick={(i) => {
                  setPicked({ name: i.name, unit: i.unit });
                  form.setValue('itemId', i.id, { shouldDirty: true, shouldValidate: true });
                }}
              />
            </Field>
            <Field
              label="Branch"
              error={errors.branchId?.message}
              required
              className="sm:col-span-2"
              hint={
                itemId && branchId
                  ? available.isLoading
                    ? 'Checking stock…'
                    : `Available at ${branchName ?? 'this branch'}: ${formatQuantity(available.data ?? '0')} ${picked.unit}`.trim()
                  : undefined
              }
            >
              <NativeSelect {...form.register('branchId')}>
                {branchList.length !== 1 && <option value="">Choose a branch</option>}
                {branchList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Change" error={errors.direction?.message} required>
              <NativeSelect {...form.register('direction')}>
                <option value="decrease">Remove stock</option>
                <option value="increase">Add stock</option>
              </NativeSelect>
            </Field>
            <Field
              label="Quantity"
              error={errors.quantity?.message}
              required
              hint={projected !== null ? `On hand after: ${formatQuantity(projected)}` : undefined}
            >
              <Input inputMode="decimal" className="tabular" {...form.register('quantity')} />
            </Field>
            <Field label="Reason" error={errors.reason?.message} required className="sm:col-span-2">
              <NativeSelect {...form.register('reason')}>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {STOCK_ADJUSTMENT_REASON_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {direction === 'increase' && can('stock_items.view_cost') && (
              <Field
                label="Unit cost"
                error={errors.unitCost?.message}
                className="sm:col-span-2"
                hint="Optional. Leave blank to value this stock at the item's current average cost."
              >
                <Input inputMode="decimal" className="tabular" {...form.register('unitCost')} />
              </Field>
            )}
            <Field
              label="Note"
              error={errors.note?.message}
              required={reason === 'other'}
              className="sm:col-span-2"
              hint="For example the count sheet number or what happened to the goods."
            >
              <Textarea rows={2} {...form.register('note')} />
            </Field>
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">Record adjustment</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
