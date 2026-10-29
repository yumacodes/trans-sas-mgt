import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodForm } from '@/lib/zodForm';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Power, PowerOff } from 'lucide-react';
import type { z } from 'zod';
import { branchInputSchema, type BranchDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, FilterSelect } from '@/components/app/DataTable';
import { ConfirmDialog, FormDialog } from '@/components/app/dialogs';
import { applyServerErrors, Field, FormGrid } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { ActiveBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/lib/api';
import { useListQuery, useUserOptions } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

type BranchFormInput = z.input<typeof branchInputSchema>;
type BranchFormOutput = z.output<typeof branchInputSchema>;

export default function BranchesPage() {
  const { can } = useAuth();
  const canManage = can('branches.manage');
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const state = useTableState(['isActive'], { sort: 'code:asc' });
  const result = useListQuery<BranchDto>(qk.branches, '/branches', state.query);
  const [form, setForm] = useState<{ open: boolean; branch: BranchDto | null }>({ open: false, branch: null });
  const [deactivate, setDeactivate] = useState<BranchDto | null>(null);
  const [view, setView] = useState<BranchDto | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.branches });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
  };

  const setStatus = async (b: BranchDto, isActive: boolean) => {
    try {
      await run(() => api.patch(`/branches/${b.id}/status`, { isActive }), {
        pending: isActive ? 'Activating branch…' : 'Deactivating branch…',
        success: `${b.name} ${isActive ? 'activated' : 'deactivated'}`,
      });
      invalidate();
    } catch {
      /* explained in the feedback dialog */
    }
  };

  const columns: ColumnDef<BranchDto>[] = [
    {
      id: 'code',
      header: 'Code',
      meta: { sortKey: 'code' },
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span>,
    },
    { id: 'name', header: 'Name', meta: { sortKey: 'name' }, cell: ({ row }) => row.original.name },
    {
      id: 'location',
      header: 'Location',
      cell: ({ row }) => [row.original.city, row.original.region].filter(Boolean).join(', ') || '—',
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => (
        <div>
          <div>{row.original.phone ?? '—'}</div>
          <div className="text-xs text-ink-subtle">{row.original.email ?? ''}</div>
        </div>
      ),
    },
    {
      id: 'manager',
      header: 'Manager',
      cell: ({ row }) => row.original.manager?.fullName ?? '—',
    },
    { id: 'status', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
  ];

  return (
    <>
      <PageHeader
        title="Branches"
        description="Company locations. Stock, clients and users can be assigned to branches."
        actions={
          canManage && (
            <Button onClick={() => setForm({ open: true, branch: null })}>
              <Plus aria-hidden /> New branch
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(b) => b.id}
        onRowClick={setView}
        caption="Branches"
        searchPlaceholder="Search code, name or city"
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
        emptyTitle="No branches yet"
        emptyDescription="Create at least one branch to hold stock and record transactions."
      />
      <RecordModal
        open={Boolean(view)}
        onOpenChange={(o) => !o && setView(null)}
        title={view?.name ?? 'Branch'}
        reference={view?.code}
        status={view && <ActiveBadge active={view.isActive} />}
        menu={
          view && canManage
            ? [
                {
                  label: 'Edit branch',
                  icon: <Pencil />,
                  onSelect: () => {
                    setForm({ open: true, branch: view });
                    setView(null);
                  },
                },
                {
                  label: view.isActive ? 'Deactivate branch' : 'Activate branch',
                  icon: view.isActive ? <PowerOff /> : <Power />,
                  onSelect: () => {
                    if (view.isActive) setDeactivate(view);
                    else void setStatus(view, true);
                    setView(null);
                  },
                  destructive: view.isActive,
                  separatorBefore: true,
                },
              ]
            : []
        }
        tabs={
          view
            ? [
                {
                  value: 'overview',
                  label: 'Overview',
                  content: (
                    <DetailList
                      items={[
                        { label: 'Branch code', value: view.code },
                        { label: 'Name', value: view.name },
                        { label: 'Address', value: view.addressLine1 },
                        { label: 'City', value: view.city },
                        { label: 'Region', value: view.region },
                        { label: 'Telephone', value: view.phone },
                        { label: 'Email', value: view.email },
                        {
                          label: 'Branch manager',
                          value: view.manager
                            ? `${view.manager.fullName} (${view.manager.email})`
                            : null,
                        },
                        { label: 'Created', value: formatDateTime(view.createdAt) },
                        { label: 'Last updated', value: formatDateTime(view.updatedAt) },
                      ]}
                    />
                  ),
                },
              ]
            : []
        }
      />

      <BranchFormDialog
        open={form.open}
        branch={form.branch}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={Boolean(deactivate)}
        onOpenChange={(o) => !o && setDeactivate(null)}
        title={`Deactivate ${deactivate?.name ?? 'branch'}?`}
        description={
          <p>
            <strong>
              {deactivate?.code} — {deactivate?.name}
            </strong>{' '}
            won&apos;t be available for new transactions. Its stock records, documents and history
            are kept, and it can be reactivated later.
          </p>
        }
        confirmLabel="Deactivate branch"
        destructive
        onConfirm={() => deactivate && setStatus(deactivate, false)}
      />
    </>
  );
}

function toValues(b: BranchDto | null): BranchFormInput {
  return {
    code: b?.code ?? '',
    name: b?.name ?? '',
    addressLine1: b?.addressLine1 ?? '',
    city: b?.city ?? '',
    region: b?.region ?? '',
    phone: b?.phone ?? '',
    email: b?.email ?? '',
    managerUserId: b?.manager?.id ?? null,
  };
}

function BranchFormDialog({
  open,
  branch,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  branch: BranchDto | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { run } = useOperation();
  const users = useUserOptions();
  const form = useForm<BranchFormInput, unknown, BranchFormOutput>({
    resolver: zodForm(branchInputSchema),
    defaultValues: toValues(branch),
  });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open) form.reset(toValues(branch));
  }, [open, branch, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await run(
        () => (branch ? api.put(`/branches/${branch.id}`, values) : api.post('/branches', values)),
        { pending: 'Saving branch…', success: branch ? 'Branch updated' : 'Branch created' },
      );
      onSaved();
      form.reset(form.getValues());
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      title={branch ? `Edit ${branch.name}` : 'New branch'}
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field label="Branch code" error={errors.code?.message} required hint="Short code such as HQ or KSI.">
              <Input autoFocus className="font-mono uppercase" maxLength={12} {...form.register('code')} />
            </Field>
            <Field label="Branch name" error={errors.name?.message} required>
              <Input {...form.register('name')} />
            </Field>
            <Field label="Address" error={errors.addressLine1?.message} className="sm:col-span-2">
              <Input {...form.register('addressLine1')} />
            </Field>
            <Field label="City" error={errors.city?.message}>
              <Input {...form.register('city')} />
            </Field>
            <Field label="Region" error={errors.region?.message}>
              <Input {...form.register('region')} />
            </Field>
            <Field label="Telephone" error={errors.phone?.message}>
              <Input type="tel" {...form.register('phone')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" {...form.register('email')} />
            </Field>
            <Field
              label="Branch manager"
              error={errors.managerUserId?.message}
              hint="Receives messages sent to branch managers."
              className="sm:col-span-2"
            >
              <NativeSelect {...form.register('managerUserId', { setValueAs: (v) => v || null })}>
                <option value="">No manager assigned</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">
            {branch ? 'Save changes' : 'Create branch'}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
