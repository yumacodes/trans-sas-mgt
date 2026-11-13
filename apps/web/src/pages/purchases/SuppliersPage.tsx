import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Power, PowerOff } from 'lucide-react';
import type { z } from 'zod';
import { supplierInputSchema, type SupplierDto, type SupplierInput } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { useKeepInput } from '@/components/app/useKeepInput';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { FormDialog } from '@/components/app/dialogs';
import { Field, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { ActiveBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';
import { useDeleteRecord } from '@/components/app/useDeleteRecord';

export default function SuppliersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const state = useTableState(['isActive'], { sort: 'name:asc' });
  const del = useDeleteRecord<SupplierDto>({
    path: '/suppliers',
    queryKey: qk.suppliers,
    noun: 'supplier',
    label: (s) => s.name,
    allowed: (s) => canManage,
  });
  const result = useListQuery<SupplierDto>(qk.suppliers, '/suppliers', state.query);
  const [form, setForm] = useState<{ open: boolean; supplier: SupplierDto | null }>({ open: false, supplier: null });
  const canManage = can('purchases.manage');

  const setActive = async (s: SupplierDto, isActive: boolean) => {
    try {
      await run(() => api.patch(`/suppliers/${s.id}/status`, { isActive }), {
        optimistic: () => patchRecord<SupplierDto>(queryClient, qk.suppliers, s.id, { isActive }),
      });
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const columns: ColumnDef<SupplierDto>[] = [
    {
      id: 'name',
      header: 'Supplier',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div>
          <CellLink onClick={() => canManage && setForm({ open: true, supplier: row.original })}>{row.original.name}</CellLink>
          <div className="font-mono text-xs text-ink-subtle">{row.original.code}</div>
        </div>
      ),
    },
    { id: 'contact', header: 'Contact', cell: ({ row }) => row.original.contactPerson ?? '—' },
    { id: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone ?? '—' },
    { id: 'email', header: 'Email', cell: ({ row }) => row.original.email ?? '—' },
    { id: 'purchases', header: 'Purchases', meta: { align: 'right', headerClassName: 'text-right' }, cell: ({ row }) => row.original.purchaseCount },
    { id: 'status', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
  ];

  const newButton = (size?: 'sm') =>
    canManage && (
      <Button size={size} onClick={() => setForm({ open: true, supplier: null })}>
        <Plus aria-hidden /> New supplier
      </Button>
    );

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Companies you buy equipment from. Shared by every branch and kept separate from clients."
        actions={newButton()}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(s) => s.id}
        rowActions={(s) => [
          { label: 'Edit', icon: <Pencil />, hidden: !canManage, onSelect: () => setForm({ open: true, supplier: s }) },
          {
            label: s.isActive ? 'Deactivate' : 'Activate',
            icon: s.isActive ? <PowerOff /> : <Power />,
            hidden: !canManage,
            destructive: s.isActive,
            onSelect: () => void setActive(s, !s.isActive),
          },
          del.action(s),
        ]}
        caption="Suppliers"
        searchPlaceholder="Search name, code or contact"
        filters={
          <FilterSelect
            label="Status"
            value={state.filters.isActive}
            onChange={(v) => state.setFilter('isActive', v)}
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
        }
        emptyTitle="No suppliers yet"
        emptyDescription="Add the companies you buy from before recording purchases."
        emptyAction={newButton('sm')}
      />
      {del.dialog}
      {canManage && (
        <SupplierFormDialog
          open={form.open}
          supplier={form.supplier}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        />
      )}
    </>
  );
}

type Output = z.output<typeof supplierInputSchema>;

const toValues = (s: SupplierDto | null): SupplierInput => ({
  name: s?.name ?? '',
  contactPerson: s?.contactPerson ?? '',
  email: s?.email ?? '',
  phone: s?.phone ?? '',
  address: s?.address ?? '',
  taxId: s?.taxId ?? '',
  notes: s?.notes ?? '',
});

function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDto | null;
}) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const recovery = useKeepInput();
  const form = useForm<SupplierInput, unknown, Output>({ resolver: zodForm(supplierInputSchema), defaultValues: toValues(supplier) });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open && !recovery.restoring()) form.reset(toValues(supplier));
  }, [open, recovery, supplier, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    const shown = {
      name: values.name,
      contactPerson: values.contactPerson ?? null,
      email: values.email ?? null,
      phone: values.phone ?? null,
      address: values.address ?? null,
      taxId: values.taxId ?? null,
      notes: values.notes ?? null,
    };
    try {
      await run(
        () =>
          supplier
            ? api.put<SupplierDto>(`/suppliers/${supplier.id}`, values)
            : api.post<SupplierDto>('/suppliers', values, idem.keyFor(values)),
        {
          optimistic: () =>
            supplier
              ? patchRecord<SupplierDto>(queryClient, qk.suppliers, supplier.id, shown)
              : insertRecord<SupplierDto>(queryClient, qk.suppliers, {
                  ...shown,
                  id: pendingId(),
                  code: '…',
                  isActive: true,
                  purchaseCount: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }),
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.suppliers });
    } catch {
      recovery.keepNextOpen();
      onOpenChange(true);
      // The error dialog already explained the failure.
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={supplier ? `Edit ${supplier.name}` : 'New supplier'}
      description={supplier ? `Supplier code ${supplier.code}` : 'A supplier code is assigned when you save.'}
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field label="Supplier name" error={errors.name?.message} required className="sm:col-span-2">
              <Input autoFocus {...form.register('name')} />
            </Field>
            <Field label="Contact person" error={errors.contactPerson?.message}>
              <Input {...form.register('contactPerson')} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <Input type="tel" {...form.register('phone')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" {...form.register('email')} />
            </Field>
            <Field label="Tax ID" error={errors.taxId?.message}>
              <Input {...form.register('taxId')} />
            </Field>
            <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('address')} />
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('notes')} />
            </Field>
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{supplier ? 'Save changes' : 'Add supplier'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
