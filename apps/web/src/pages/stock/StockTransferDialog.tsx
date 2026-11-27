import { useEffect, useState, type ReactElement } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { z } from 'zod';
import {
  stockTransferInputSchema,
  type StockOperationResultDto,
  type StockTransferInput,
} from '@tsm/shared';
import { FormDialog } from '@/components/app/dialogs';
import { ItemNameInput } from '@/components/app/DocumentPickers';
import {
  applyServerErrors,
  Field,
  FormError,
  FormGrid,
  useIdempotencyKey,
} from '@/components/app/form';
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

type Output = z.output<typeof stockTransferInputSchema>;
interface Label {
  name: string;
  unit: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the first line and the source branch, e.g. when opened from a balance row. */
  target?: StockTarget | null;
}

/** Moves stock from one branch to another in a single recorded transfer. */
export function StockTransferDialog({ open, onOpenChange, target }: Props) {
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const recovery = useKeepInput();
  const invalidate = useInvalidateStock();
  const branches = useBranchOptions();
  const branchList = branches.data ?? [];
  // Item names shown in the pickers, by line position; only ids are sent.
  const [labels, setLabels] = useState<Label[]>([]);

  const blank = (): StockTransferInput => ({
    fromBranchId: target?.branchId ?? '',
    toBranchId: '',
    items: [{ itemId: target?.itemId ?? '', quantity: '' }],
    note: '',
  });
  const form = useForm<StockTransferInput, unknown, Output>({
    resolver: zodForm(stockTransferInputSchema),
    defaultValues: blank(),
  });
  const lines = useFieldArray({ control: form.control, name: 'items' });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open && !recovery.restoring()) {
      form.reset(blank());
      setLabels([{ name: target?.itemName ?? '', unit: target?.unit ?? '' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  const fromBranchId = form.watch('fromBranchId');
  const toBranchId = form.watch('toBranchId');
  const fromName = branchList.find((b) => b.id === fromBranchId)?.name;
  const tooFewBranches = branches.isSuccess && branchList.length < 2;

  const setLabel = (index: number, label: Label) =>
    setLabels((prev) => {
      const next = [...prev];
      next[index] = label;
      return next;
    });

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      await run(
        () =>
          api.post<StockOperationResultDto>(
            '/stock-balances/transfers',
            values,
            idem.keyFor(values),
          ),
        { success: (r) => `Stock transferred · ${r.reference}` },
      );
      idem.reset();
      invalidate();
    } catch (error) {
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
      size="lg"
      title="Transfer stock"
      description="Move stock from one branch to another. The source loses exactly what the destination gains, so total stock is unchanged."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-5">
          {tooFewBranches && (
            <FormError message="Transfers need at least two active branches that you can work in. Ask your administrator to add a branch or assign you to one." />
          )}
          <FormGrid>
            <Field label="From branch" error={errors.fromBranchId?.message} required>
              <NativeSelect {...form.register('fromBranchId')}>
                <option value="">Choose a branch</option>
                {branchList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="To branch" error={errors.toBranchId?.message} required>
              <NativeSelect {...form.register('toBranchId')}>
                <option value="">Choose a branch</option>
                {branchList
                  .filter((b) => b.id !== fromBranchId || b.id === toBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </FormGrid>

          <div className="space-y-3">
            <h3 className="eyebrow !text-accent">Items</h3>
            {errors.items?.message && <FormError message={errors.items.message} />}
            {lines.fields.map((field, index) => {
              const e = errors.items?.[index];
              return (
                <TransferLine
                  key={field.id}
                  index={index}
                  label={labels[index] ?? { name: '', unit: '' }}
                  itemId={form.watch(`items.${index}.itemId`)}
                  fromBranchId={fromBranchId}
                  fromName={fromName}
                  itemError={e?.itemId?.message}
                  quantityError={e?.quantity?.message}
                  quantityInput={
                    <Input
                      inputMode="decimal"
                      className="tabular"
                      {...form.register(`items.${index}.quantity`)}
                    />
                  }
                  canRemove={lines.fields.length > 1}
                  onRemove={() => {
                    lines.remove(index);
                    setLabels((prev) => prev.filter((_, i) => i !== index));
                  }}
                  onType={(text) => {
                    setLabel(index, { name: text, unit: '' });
                    form.setValue(`items.${index}.itemId`, '', { shouldDirty: true });
                  }}
                  onPick={(i) => {
                    setLabel(index, { name: i.name, unit: i.unit });
                    form.setValue(`items.${index}.itemId`, i.id, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
              );
            })}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={lines.fields.length >= 100}
              onClick={() => {
                lines.append({ itemId: '', quantity: '' });
                setLabels((prev) => [...prev, { name: '', unit: '' }]);
              }}
            >
              <Plus aria-hidden /> Add item
            </Button>
          </div>

          <Field
            label="Note"
            error={errors.note?.message}
            hint="For example the reason for the transfer or who is carrying the goods."
          >
            <Textarea rows={2} {...form.register('note')} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" disabled={tooFewBranches}>
            Transfer stock
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

function TransferLine({
  index,
  label,
  itemId,
  fromBranchId,
  fromName,
  itemError,
  quantityError,
  quantityInput,
  canRemove,
  onRemove,
  onType,
  onPick,
}: {
  index: number;
  label: Label;
  itemId: string;
  fromBranchId: string;
  fromName?: string;
  itemError?: string;
  quantityError?: string;
  quantityInput: ReactElement<Record<string, unknown>>;
  canRemove: boolean;
  onRemove: () => void;
  onType: (text: string) => void;
  onPick: (item: { id: string; name: string; unit: string }) => void;
}) {
  const available = useAvailableQuantity(itemId || undefined, fromBranchId || undefined);
  const hint =
    itemId && fromBranchId
      ? available.isLoading
        ? 'Checking stock…'
        : `Available at ${fromName ?? 'source'}: ${formatQuantity(available.data ?? '0')} ${label.unit}`.trim()
      : undefined;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[minmax(0,3fr)_140px_auto]">
      <Field label="Item" error={itemError} required className="col-span-2 sm:col-span-1">
        <ItemNameInput
          base={STOCK_PICKER_BASE}
          value={label.name}
          invalid={Boolean(itemError)}
          placeholder="Search item code or name"
          onChange={onType}
          onPick={onPick}
        />
      </Field>
      <Field label="Quantity" error={quantityError} required hint={hint}>
        {quantityInput}
      </Field>
      <div className="flex items-end pb-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove item ${index + 1}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  );
}
