import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  stockCategoryInputSchema,
  type StockCategoryDto,
  type StockCategoryInput,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { applyServerErrors, Field } from '@/components/app/form';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import { useOperation } from '@/components/app/OperationFeedback';
import { ActiveBadge } from '@/components/app/StatusBadges';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useStockCategories } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';

type Output = z.output<typeof stockCategoryInputSchema>;

/** Manage stock categories inline: create, rename, activate/deactivate. */
export function CategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { can } = useAuth();
  const categories = useStockCategories();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StockCategoryDto | 'new' | null>(null);

  const toggle = async (c: StockCategoryDto) => {
    try {
      await api.patch(`/stock-categories/${c.id}/status`, { isActive: !c.isActive });
      toast.success(`${c.name} ${c.isActive ? 'deactivated' : 'activated'}`);
      void queryClient.invalidateQueries({ queryKey: qk.stockCategories });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Stock categories</DialogTitle>
          <DialogDescription>
            Categories group catalogue items. Inactive categories can&apos;t be chosen for new
            items.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {can('stock_items.create') && editing !== 'new' && (
            <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
              <Plus aria-hidden /> New category
            </Button>
          )}
          {editing === 'new' && <CategoryForm onDone={() => setEditing(null)} />}
          {categories.isLoading ? (
            <SectionLoader />
          ) : categories.isError ? (
            <ErrorState
              message={errorMessage(categories.error)}
              onRetry={() => void categories.refetch()}
            />
          ) : (categories.data ?? []).length === 0 ? (
            <EmptyState
              title="No categories yet"
              description="Create categories such as Imaging, Monitors or Consumables."
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {categories.data!.map((c) =>
                editing !== 'new' && editing?.id === c.id ? (
                  <li key={c.id} className="p-3">
                    <CategoryForm category={c} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{c.name}</p>
                      <p className="truncate text-xs text-ink-subtle">
                        {c.itemCount} item{c.itemCount === 1 ? '' : 's'}
                        {c.description ? ` · ${c.description}` : ''}
                      </p>
                    </div>
                    <ActiveBadge active={c.isActive} />
                    {can('stock_items.update') && (
                      <>
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={() => void toggle(c)}
                          aria-label={`${c.isActive ? 'Deactivate' : 'Activate'} ${c.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(c)}
                          aria-label={`Rename ${c.name}`}
                        >
                          <Pencil aria-hidden />
                        </Button>
                      </>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ category, onDone }: { category?: StockCategoryDto; onDone: () => void }) {
  const { run } = useOperation();
  const queryClient = useQueryClient();
  const form = useForm<StockCategoryInput, unknown, Output>({
    resolver: zodForm(stockCategoryInputSchema),
    defaultValues: { name: category?.name ?? '', description: category?.description ?? '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await run(
        () =>
          category
            ? api.put(`/stock-categories/${category.id}`, values)
            : api.post('/stock-categories', values),
        {
          pending: category ? 'Saving category…' : 'Creating category…',
          success: category ? 'Category updated' : 'Category created',
        },
      );
      void queryClient.invalidateQueries({ queryKey: qk.stockCategories });
      onDone();
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        void onSubmit(e);
      }}
      noValidate
      className="space-y-3 rounded-md border border-border bg-surface-muted p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={errors.name?.message} required>
          <Input autoFocus {...form.register('name')} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <Input {...form.register('description')} />
        </Field>
      </div>
      {errors.root?.message && (
        <p role="alert" className="text-xs text-danger">
          {errors.root.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          {category ? 'Save' : 'Add category'}
        </Button>
      </div>
    </form>
  );
}
