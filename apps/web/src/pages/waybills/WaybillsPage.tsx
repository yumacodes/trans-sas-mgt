import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, FileDown, FileSignature, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
import type { z } from 'zod';
import {
  WAYBILL_STATUSES,
  WAYBILL_STATUS_LABELS,
  waybillInputSchema,
  type WaybillDto,
  type WaybillInput,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { useKeepInput } from '@/components/app/useKeepInput';
import { AttachmentsPanel } from '@/components/app/AttachmentsPanel';
import { DocumentEmailComposer } from '@/components/app/DocumentEmailComposer';
import { BranchField, BranchFilter } from '@/components/app/BranchControls';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { ConfirmDialog, FormDialog, ReasonDialog } from '@/components/app/dialogs';
import { CustomerInput, ItemNameInput } from '@/components/app/DocumentPickers';
import { EntityHistory } from '@/components/app/EntityHistory';
import { Field, FormGrid, FormSection, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { WaybillStatusBadge } from '@/components/app/StatusBadges';
import { usePdfActions } from '@/components/app/usePdfActions';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatQuantity, todayIso } from '@/lib/format';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';
import { useDeleteRecord } from '@/components/app/useDeleteRecord';

const BASE = '/waybills';

export default function WaybillsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const state = useTableState(['status', 'branchId'], { sort: 'deliveryDate:desc' });
  const rowPdf = usePdfActions('/waybills');
  const del = useDeleteRecord<WaybillDto>({
    path: '/waybills',
    queryKey: qk.waybills,
    noun: 'waybill',
    label: (w) => w.number,
    allowed: (w) => canManage && (w.status === 'draft' || w.status === 'cancelled'),
  });
  const result = useListQuery<WaybillDto>(qk.waybills, BASE, state.query);
  const [viewId, setViewId] = useState<string | null>(params.get('open'));
  const [form, setForm] = useState<{ open: boolean; waybill: WaybillDto | null }>({ open: false, waybill: null });
  const canManage = can('waybills.manage');

  const closeView = () => {
    setViewId(null);
    if (params.has('open')) {
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
    }
  };

  const columns: ColumnDef<WaybillDto>[] = [
    {
      id: 'number',
      header: 'Waybill No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    { id: 'deliveryDate', header: 'Delivery date', meta: { sortKey: 'deliveryDate' }, cell: ({ row }) => formatDate(row.original.deliveryDate) },
    { id: 'recipientName', header: 'Deliver to', meta: { sortKey: 'recipientName' }, cell: ({ row }) => row.original.recipientName },
    { id: 'sale', header: 'Sale', cell: ({ row }) => row.original.sale?.number ?? 'No sale' },
    { id: 'branch', header: 'Branch', cell: ({ row }) => row.original.branch?.code ?? '—' },
    { id: 'items', header: 'Items', meta: { align: 'right', headerClassName: 'text-right' }, cell: ({ row }) => row.original.itemCount },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <WaybillStatusBadge status={row.original.status} />,
    },
  ];

  const newButton = (size?: 'sm') =>
    canManage && (
      <Button size={size} onClick={() => setForm({ open: true, waybill: null })}>
        <Plus aria-hidden /> New waybill
      </Button>
    );

  return (
    <>
      <PageHeader
        title="Way Bill"
        description="Delivery notes. A waybill for a sale only records delivery; one with no sale takes stock off when dispatched."
        actions={newButton()}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(w) => w.id}
        onRowClick={(w) => setViewId(w.id)}
        rowActions={(w) => [
          {
            label: 'Edit',
            icon: <Pencil />,
            hidden: !canManage || w.status !== 'draft',
            onSelect: () => setForm({ open: true, waybill: w }),
          },
          { label: 'Download PDF', icon: <FileDown />, onSelect: () => void rowPdf.download(w) },
          del.action(w),
        ]}
        caption="Waybills"
        searchPlaceholder="Search waybill, recipient or sale"
        filters={
          <>
            <BranchFilter state={state} />
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={WAYBILL_STATUSES.map((s) => ({ value: s, label: WAYBILL_STATUS_LABELS[s] }))}
            />
          </>
        }
        emptyTitle="No waybills yet"
        emptyDescription="Make one from a confirmed sale, or create one for a delivery with no sale."
        emptyAction={newButton('sm')}
      />
      {del.dialog}
      <WaybillDetailModal
        waybillId={viewId}
        onOpenChange={(o) => !o && closeView()}
        onEdit={(waybill) => {
          closeView();
          setForm({ open: true, waybill });
        }}
      />
      {canManage && (
        <WaybillFormDialog
          open={form.open}
          waybill={form.waybill}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        />
      )}
    </>
  );
}

function WaybillDetailModal({
  waybillId,
  onOpenChange,
  onEdit,
}: {
  waybillId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (w: WaybillDto) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const navigate = useNavigate();
  const pdf = usePdfActions(BASE);
  const [action, setAction] = useState<'dispatch' | 'cancel' | 'deliver' | null>(null);
  const canManage = can('waybills.manage');

  const query = useQuery({
    queryKey: [...qk.waybills, 'detail', waybillId],
    queryFn: ({ signal }) => api.get<WaybillDto>(`${BASE}/${waybillId}`, undefined, signal),
    enabled: Boolean(waybillId),
  });
  const w = query.data;

  const makeLetter = async () => {
    if (!w) return;
    try {
      const letter = await run(() => api.post<{ id: string }>(`/acceptance-letters/from-waybill/${w.id}`));
      void queryClient.invalidateQueries({ queryKey: qk.acceptanceLetters });
      onOpenChange(false);
      void navigate(`/acceptance-letters?open=${letter.id}`);
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const act = async (path: string, patch: Partial<WaybillDto>, body?: unknown) => {
    if (!w) return;
    try {
      await run(() => api.post<WaybillDto>(`${BASE}/${w.id}/${path}`, body), {
        optimistic: () => patchRecord<WaybillDto>(queryClient, qk.waybills, w.id, patch),
      });
      void queryClient.invalidateQueries({ queryKey: qk.waybills });
      void queryClient.invalidateQueries({ queryKey: qk.stockItems });
      void queryClient.invalidateQueries({ queryKey: qk.stockBalances });
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const details = w && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'Deliver to', value: w.recipientName },
          { label: 'Delivery date', value: formatDate(w.deliveryDate) },
          { label: 'Sale', value: w.sale?.number ?? 'No sale' },
          { label: 'Branch', value: w.branch?.name },
          { label: 'Carrier', value: w.carrier },
          { label: 'Vehicle', value: w.vehicleNumber },
          { label: 'Dispatched', value: w.dispatchedAt ? formatDateTime(w.dispatchedAt) : null },
          { label: 'Delivered', value: w.deliveredAt ? formatDateTime(w.deliveredAt) : null },
          { label: 'Received by', value: w.receivedBy },
          { label: 'Prepared by', value: w.preparedBy },
          { label: 'Address', value: w.deliveryAddress, wide: true },
          { label: 'Notes', value: w.notes, wide: true },
        ]}
      />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">Unit</th>
            </tr>
          </thead>
          <tbody>
            {w.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{i.name}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(i.quantity)}</td>
                <td className="px-3 py-2">{i.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <RecordModal
        open={Boolean(waybillId)}
        onOpenChange={onOpenChange}
        title={w ? `Waybill ${w.number}` : 'Waybill'}
        subtitle={w?.recipientName}
        status={w && <WaybillStatusBadge status={w.status} />}
        reference={w?.number}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        tabs={
          w
            ? [
                { value: 'details', label: 'Details', content: details },
                {
                  value: 'files',
                  label: 'Files',
                  content: <AttachmentsPanel ownerType="waybill" ownerId={w.id} canManage={can('waybills.manage')} />,
                },
                ...(can('waybills.manage')
                  ? [
                      {
                        value: 'email',
                        label: 'Email',
                        content: (
                          <DocumentEmailComposer
                            key={w.id}
                            path={`/waybills/${w.id}`}
                            number={w.number}
                            documentLabel="waybill"
                            recipientName={w.recipientName}
                            defaultTo={null}
                            defaultSubject={`Delivery note ${w.number}`}
                            intro={`Please find attached the delivery note ${w.number} for your order.`}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(can('audit.read')
                  ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="waybill" entityId={w.id} /> }]
                  : []),
              ]
            : []
        }
        actions={
          w && (
            <>
              {canManage && w.status === 'draft' && (
                <>
                  <Button variant="secondary" onClick={() => onEdit(w)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  <Button variant="secondary" onClick={() => setAction('dispatch')}>
                    <Send aria-hidden /> Dispatch
                  </Button>
                </>
              )}
              {w.status === 'delivered' && can('acceptance.manage') && (
                <Button variant="secondary" onClick={() => void makeLetter()}>
                  <FileSignature aria-hidden /> Acceptance letter
                </Button>
              )}
              {canManage && w.status === 'dispatched' && (
                <Button variant="secondary" onClick={() => setAction('deliver')}>
                  <CheckCircle2 aria-hidden /> Mark delivered
                </Button>
              )}
              {canManage && (w.status === 'draft' || w.status === 'dispatched') && (
                <Button variant="secondary" onClick={() => setAction('cancel')}>
                  <Ban aria-hidden /> Cancel waybill
                </Button>
              )}
              <Button onClick={() => void pdf.print(w)} loading={pdf.isBusy('print', w.id)}>
                <Printer aria-hidden /> Print
              </Button>
            </>
          )
        }
      />
      <ConfirmDialog
        open={action === 'dispatch' || action === 'cancel'}
        onOpenChange={(o) => !o && setAction(null)}
        title={action === 'dispatch' ? 'Dispatch this waybill?' : 'Cancel this waybill?'}
        description={
          action === 'dispatch'
            ? w?.sale
              ? 'This records that the goods have left. Stock already came off when the sale was confirmed.'
              : 'This waybill has no sale, so its stock will be taken off the branch now.'
            : w?.stockIssued
              ? 'Its stock will be returned to the branch.'
              : 'It stays in the history but can no longer be used.'
        }
        confirmLabel={action === 'dispatch' ? 'Dispatch' : 'Cancel waybill'}
        destructive={action === 'cancel'}
        onConfirm={() =>
          action === 'dispatch'
            ? act('dispatch', { status: 'dispatched' })
            : act('cancel', { status: 'cancelled' })
        }
      />
      <ReasonDialog
        open={action === 'deliver'}
        onOpenChange={(o) => !o && setAction(null)}
        title="Mark as delivered?"
        description="Enter the name of the person who received the goods."
        label="Received by"
        confirmLabel="Mark delivered"
        onConfirm={(receivedBy) => void act('deliver', { status: 'delivered', receivedBy }, { receivedBy })}
      />
    </>
  );
}

type Output = z.output<typeof waybillInputSchema>;
const blankItem = { saleItemId: null, stockItemId: null, name: '', quantity: '1', unit: '' };

function toFormValues(w: WaybillDto | null): WaybillInput {
  if (!w) {
    return {
      branchId: null,
      saleId: null,
      clientId: null,
      recipientName: '',
      deliveryAddress: '',
      deliveryDate: todayIso(),
      carrier: '',
      vehicleNumber: '',
      notes: '',
      items: [{ ...blankItem }],
    };
  }
  return {
    branchId: w.branch?.id ?? null,
    saleId: w.sale?.id ?? null,
    clientId: w.clientId,
    recipientName: w.recipientName,
    deliveryAddress: w.deliveryAddress ?? '',
    deliveryDate: w.deliveryDate,
    carrier: w.carrier ?? '',
    vehicleNumber: w.vehicleNumber ?? '',
    notes: w.notes ?? '',
    items: w.items.map((i) => ({
      saleItemId: i.saleItemId,
      stockItemId: i.stockItemId,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
    })),
  };
}

function WaybillFormDialog({
  open,
  onOpenChange,
  waybill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waybill: WaybillDto | null;
}) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const isEdit = Boolean(waybill);
  // Lines on a sale's waybill come from the sale, so only their quantities can change.
  const linked = Boolean(waybill?.sale);
  const recovery = useKeepInput();

  const form = useForm<WaybillInput, unknown, Output>({
    resolver: zodForm(waybillInputSchema),
    defaultValues: toFormValues(waybill),
  });
  const { errors, isDirty } = form.formState;
  const items = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open && !recovery.restoring()) form.reset(toFormValues(waybill));
  }, [open, recovery, waybill, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      await run(
        () =>
          isEdit
            ? api.put<WaybillDto>(`${BASE}/${waybill!.id}`, values)
            : api.post<WaybillDto>(BASE, values, idem.keyFor(values)),
        {
          optimistic: () => {
            const shown = {
              recipientName: values.recipientName,
              deliveryAddress: values.deliveryAddress ?? null,
              deliveryDate: values.deliveryDate,
              carrier: values.carrier ?? null,
              vehicleNumber: values.vehicleNumber ?? null,
              notes: values.notes ?? null,
              itemCount: values.items.length,
              items: values.items.map((i) => ({
                id: pendingId(),
                saleItemId: i.saleItemId ?? null,
                stockItemId: i.stockItemId ?? null,
                name: i.name,
                quantity: i.quantity,
                unit: i.unit,
              })),
            };
            return isEdit
              ? patchRecord<WaybillDto>(queryClient, qk.waybills, waybill!.id, shown)
              : insertRecord<WaybillDto>(queryClient, qk.waybills, {
                  ...shown,
                  id: pendingId(),
                  number: '…',
                  branch: null,
                  sale: null,
                  clientId: values.clientId ?? null,
                  receivedBy: null,
                  status: 'draft',
                  stockIssued: false,
                  dispatchedAt: null,
                  deliveredAt: null,
                  preparedBy: me?.user.fullName ?? '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
          },
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.waybills });
    } catch {
      recovery.keepNextOpen();
      onOpenChange(true);
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
      title={isEdit ? `Edit ${waybill!.number}` : 'New waybill'}
      description={
        linked
          ? `For sale ${waybill!.sale!.number}. Stock already came off when the sale was confirmed.`
          : 'A delivery with no sale. Its stock comes off when it is dispatched.'
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Delivery">
            <FormGrid>
              {!linked && (
                <BranchField
                  registration={form.register('branchId', { setValueAs: (v) => v || null })}
                  error={errors.branchId?.message}
                  current={waybill?.branch?.name}
                />
              )}
              <Field label="Delivery date" error={errors.deliveryDate?.message} required>
                <Input type="date" {...form.register('deliveryDate')} />
              </Field>
              <Field label="Deliver to" error={errors.recipientName?.message} required className="sm:col-span-2">
                <Controller
                  control={form.control}
                  name="recipientName"
                  render={({ field }) => (
                    <CustomerInput
                      base={BASE}
                      value={field.value}
                      invalid={Boolean(errors.recipientName)}
                      onChange={(text) => {
                        field.onChange(text);
                        if (form.getValues('clientId')) form.setValue('clientId', null);
                      }}
                      onPick={(c) => {
                        form.setValue('recipientName', c.name, { shouldDirty: true });
                        form.setValue('clientId', c.id, { shouldDirty: true });
                        form.setValue('deliveryAddress', c.address ?? '', { shouldDirty: true });
                      }}
                    />
                  )}
                />
              </Field>
              <Field label="Delivery address" error={errors.deliveryAddress?.message} className="sm:col-span-2">
                <Textarea rows={2} {...form.register('deliveryAddress')} />
              </Field>
              <Field label="Carrier" error={errors.carrier?.message}>
                <Input {...form.register('carrier')} />
              </Field>
              <Field label="Vehicle number" error={errors.vehicleNumber?.message}>
                <Input {...form.register('vehicleNumber')} />
              </Field>
            </FormGrid>
          </FormSection>
          <FormSection title="Items">
            <div className="space-y-3">
              {items.fields.map((field, index) => {
                const e = errors.items?.[index];
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-2 gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[minmax(0,3fr)_100px_100px_auto]"
                  >
                    <Field label="Item" error={e?.name?.message} required className="col-span-2 sm:col-span-1">
                      {linked ? (
                        <Input readOnly className="bg-surface-muted" {...form.register(`items.${index}.name`)} />
                      ) : (
                        <Controller
                          control={form.control}
                          name={`items.${index}.name`}
                          render={({ field: f }) => (
                            <ItemNameInput
                              base={BASE}
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
                              }}
                            />
                          )}
                        />
                      )}
                    </Field>
                    <Field label="Quantity" error={e?.quantity?.message} required>
                      <Input inputMode="decimal" {...form.register(`items.${index}.quantity`)} />
                    </Field>
                    <Field label="Unit" error={e?.unit?.message} required>
                      <Input readOnly={linked} {...form.register(`items.${index}.unit`)} />
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
              {!linked && (
                <Button type="button" variant="secondary" size="sm" onClick={() => items.append({ ...blankItem })}>
                  <Plus aria-hidden /> Add item
                </Button>
              )}
            </div>
            <Field label="Notes" error={errors.notes?.message}>
              <Textarea rows={2} {...form.register('notes')} />
            </Field>
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : 'Create waybill'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
