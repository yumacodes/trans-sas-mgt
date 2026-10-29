import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  stockItemInputSchema,
  TRACKING_MODE_LABELS,
  TRACKING_MODES,
  UNITS_OF_MEASURE,
  type StockItemDto,
  type StockItemInput,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { FormDialog } from '@/components/app/dialogs';
import {
  applyServerErrors,
  Field,
  FormGrid,
  FormSection,
  useIdempotencyKey,
} from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useStockCategories } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { StagedImagePicker, StockItemImageManager, uploadStagedImages } from './StockItemImages';

type Output = z.output<typeof stockItemInputSchema>;

export const DUPLICATE_SKU_MESSAGE =
  'This item code is already in use. Choose a different code or open the existing item.';

function toFormValues(item?: StockItemDto | null): StockItemInput {
  return {
    sku: item?.sku ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    categoryId: item?.category?.id ?? null,
    brand: item?.brand ?? '',
    model: item?.model ?? '',
    unit: item?.unit ?? 'unit',
    purchaseCost: item?.purchaseCost ?? '',
    sellingPrice: item?.sellingPrice ?? '',
    reorderLevel: item?.reorderLevel ?? 0,
    trackingMode: item?.trackingMode ?? 'none',
    warrantyMonths: item?.warrantyMonths ?? '',
    tracksExpiry: item?.tracksExpiry ?? false,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: StockItemDto | null;
}

export function StockItemFormDialog({ open, onOpenChange, item }: Props) {
  const { can, me } = useAuth();
  const canViewCost = can('stock_items.view_cost');
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const categories = useStockCategories();
  const isEdit = Boolean(item);
  // A new item does not exist yet, so its images wait here until it has been created.
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const currency = me?.company?.defaultCurrency ?? '';

  const form = useForm<StockItemInput, unknown, Output>({
    resolver: zodForm(stockItemInputSchema),
    defaultValues: toFormValues(item),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(item));
      setStagedImages([]);
    }
  }, [open, item, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    // Users who cannot see costs must not overwrite them with an empty value.
    const payload: Partial<Output> = { ...values };
    if (!canViewCost) delete payload.purchaseCost;
    try {
      // The item is created first; its staged images are uploaded straight afterwards,
      // inside the same feedback dialog. An image that fails does not undo the item, so
      // it is reported separately rather than as a failed save.
      const { imageError } = await run(
        async () => {
          if (isEdit) {
            await api.put<StockItemDto>(`/stock-items/${item!.id}`, payload);
            return { imageError: null };
          }
          const saved = await api.post<StockItemDto>('/stock-items', payload, idem.keyFor(payload));
          try {
            await uploadStagedImages(saved.id, stagedImages);
          } catch (uploadError) {
            return { imageError: errorMessage(uploadError) };
          }
          return { imageError: null };
        },
        {
          pending: isEdit ? 'Saving item…' : 'Creating item…',
          success: isEdit ? 'Stock item updated' : 'Stock item created',
        },
      );
      idem.reset();
      if (imageError) {
        toast.error(`The item was saved, but its images were not uploaded. ${imageError}`);
      }
      void queryClient.invalidateQueries({ queryKey: qk.stockItems });
      void queryClient.invalidateQueries({ queryKey: qk.stockCategories });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      form.reset(form.getValues());
      onOpenChange(false);
    } catch (error) {
      if (applyServerErrors(error, form.setError)) return;
      if (error instanceof ApiError && error.code === 'DUPLICATE') {
        form.setError(
          'sku',
          { type: 'server', message: DUPLICATE_SKU_MESSAGE },
          { shouldFocus: true },
        );
      }
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty || stagedImages.length > 0}
      size="xl"
      title={isEdit ? `Edit ${item!.name}` : 'New stock item'}
      description={isEdit ? `Item code ${item!.sku}` : 'Add a product to the equipment catalogue.'}
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Identification">
            <FormGrid className="lg:grid-cols-3">
              <Field
                label="Item code (SKU)"
                error={errors.sku?.message}
                required
                hint="Stored in capitals; must be unique."
              >
                <Input
                  autoFocus={!isEdit}
                  className="font-mono uppercase"
                  {...form.register('sku')}
                />
              </Field>
              <Field
                label="Item name"
                error={errors.name?.message}
                required
                className="lg:col-span-2"
              >
                <Input {...form.register('name')} />
              </Field>
              <Field label="Category" error={errors.categoryId?.message}>
                <NativeSelect {...form.register('categoryId', { setValueAs: (v) => v || null })}>
                  <option value="">Uncategorised</option>
                  {categories.data
                    ?.filter((c) => c.isActive || c.id === item?.category?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Brand / manufacturer" error={errors.brand?.message}>
                <Input {...form.register('brand')} />
              </Field>
              <Field label="Model" error={errors.model?.message}>
                <Input {...form.register('model')} />
              </Field>
              <Field
                label="Description"
                error={errors.description?.message}
                className="sm:col-span-2 lg:col-span-3"
              >
                <Textarea {...form.register('description')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Pricing and stock control">
            <FormGrid className="lg:grid-cols-3">
              <Field label="Unit of measure" error={errors.unit?.message} required>
                <Input list="units-of-measure" {...form.register('unit')} />
              </Field>
              <datalist id="units-of-measure">
                {UNITS_OF_MEASURE.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <Field
                label={`Selling price${currency ? ` (${currency})` : ''}`}
                error={errors.sellingPrice?.message}
                required
              >
                <Input inputMode="decimal" className="tabular" {...form.register('sellingPrice')} />
              </Field>
              {canViewCost && (
                <Field
                  label={`Purchase cost${currency ? ` (${currency})` : ''}`}
                  error={errors.purchaseCost?.message}
                  hint="Visible only to users permitted to see costs."
                >
                  <Input
                    inputMode="decimal"
                    className="tabular"
                    {...form.register('purchaseCost')}
                  />
                </Field>
              )}
              <Field
                label="Reorder level"
                error={errors.reorderLevel?.message}
                required
                hint="Flag as low stock at or below this quantity."
              >
                <Input type="number" min={0} step={1} {...form.register('reorderLevel')} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection
            title="Tracking"
            description="Serial and batch settings record how individual units will be tracked when stock is received."
          >
            <FormGrid className="lg:grid-cols-3">
              <Field label="Tracking mode" error={errors.trackingMode?.message} required>
                <NativeSelect {...form.register('trackingMode')}>
                  {TRACKING_MODES.map((m) => (
                    <option key={m} value={m}>
                      {TRACKING_MODE_LABELS[m]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Warranty (months)" error={errors.warrantyMonths?.message}>
                <Input type="number" min={0} max={240} {...form.register('warrantyMonths')} />
              </Field>
              <div className="flex items-end pb-2">
                <Controller
                  control={form.control}
                  name="tracksExpiry"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <Checkbox
                        checked={Boolean(field.value)}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                      Track expiry dates
                    </label>
                  )}
                />
              </div>
            </FormGrid>
          </FormSection>
          <FormSection
            title="Images"
            description={
              isEdit
                ? 'Photographs of this item. Changes here are saved immediately.'
                : 'Photographs are uploaded as soon as the item has been created.'
            }
          >
            {isEdit ? (
              <StockItemImageManager
                itemId={item!.id}
                itemName={item!.name}
                canEdit={can('stock_items.update')}
              />
            ) : (
              <StagedImagePicker files={stagedImages} onChange={setStagedImages} />
            )}
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : 'Create item'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
