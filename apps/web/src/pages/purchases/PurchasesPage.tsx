import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, FileDown, PackageCheck, Pencil, Plus, Printer, Send, Sparkles, Trash2 } from 'lucide-react';
import type { z } from 'zod';
import {
  PROFORMA_CURRENCIES,
  PROFORMA_CURRENCY_LABELS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
  calculateProformaTotals,
  purchaseInputSchema,
  toDecimal,
  type PurchaseDto,
  type PurchaseInput,
  type SupplierDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { useKeepInput } from '@/components/app/useKeepInput';
import { AttachmentsPanel } from '@/components/app/AttachmentsPanel';
import { useOpenParam } from '@/components/app/useOpenParam';
import { DocumentEmailComposer } from '@/components/app/DocumentEmailComposer';
import { BranchField, BranchFilter } from '@/components/app/BranchControls';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { ConfirmDialog, FormDialog } from '@/components/app/dialogs';
import { ItemNameInput } from '@/components/app/DocumentPickers';
import { EntityHistory } from '@/components/app/EntityHistory';
import { Field, FormGrid, FormSection, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { PurchaseStatusBadge } from '@/components/app/StatusBadges';
import { usePdfActions } from '@/components/app/usePdfActions';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney, formatQuantity, todayIso } from '@/lib/format';
import { insertRecord, patchRecord, pendingId } from '@/lib/optimistic';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';

const BASE = '/purchases';

function useSuppliers(enabled: boolean) {
  return useQuery({
    queryKey: [...qk.suppliers, 'options'],
    queryFn: ({ signal }) =>
      api.get<SupplierDto[]>('/suppliers', { page: 1, pageSize: 100, isActive: 'true', sort: 'name:asc' }, signal),
    enabled,
  });
}

export default function PurchasesPage() {
  const { can } = useAuth();
  const state = useTableState(['status', 'branchId'], { sort: 'purchaseDate:desc' });
  const result = useListQuery<PurchaseDto>(qk.purchases, BASE, state.query);
  const [viewId, setViewId, closeView] = useOpenParam();
  const [form, setForm] = useState<{ open: boolean; purchase: PurchaseDto | null }>({ open: false, purchase: null });
  const [reorderOpen, setReorderOpen] = useState(false);
  const canManage = can('purchases.manage');
  const right = { align: 'right' as const, headerClassName: 'text-right' };

  const columns: ColumnDef<PurchaseDto>[] = [
    {
      id: 'number',
      header: 'PO No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    { id: 'purchaseDate', header: 'Date', meta: { sortKey: 'purchaseDate' }, cell: ({ row }) => formatDate(row.original.purchaseDate) },
    { id: 'supplier', header: 'Supplier', cell: ({ row }) => row.original.supplier.name },
    { id: 'branch', header: 'Receiving branch', cell: ({ row }) => row.original.branch?.code ?? '—' },
    { id: 'items', header: 'Items', meta: right, cell: ({ row }) => row.original.itemCount },
    {
      id: 'total',
      header: 'Total',
      meta: { ...right, sortKey: 'total' },
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.total, row.original.currency)}</span>,
    },
    { id: 'status', header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <PurchaseStatusBadge status={row.original.status} /> },
  ];

  const newButton = (size?: 'sm') =>
    canManage && (
      <Button size={size} onClick={() => setForm({ open: true, purchase: null })}>
        <Plus aria-hidden /> New purchase
      </Button>
    );

  return (
    <>
      <PageHeader
        title="Purchase"
        description="Orders to suppliers. Stock goes up only when you receive the goods, and only by what arrived."
        actions={
          <>
            {canManage && (
              <Button variant="secondary" onClick={() => setReorderOpen(true)}>
                <Sparkles aria-hidden /> Draft from low stock
              </Button>
            )}
            {newButton()}
          </>
        }
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(p) => p.id}
        onRowClick={(p) => setViewId(p.id)}
        rowActions={(p) => [
          {
            label: 'Edit',
            icon: <Pencil />,
            hidden: !canManage || p.status !== 'draft',
            onSelect: () => setForm({ open: true, purchase: p }),
          },
        ]}
        caption="Purchases"
        searchPlaceholder="Search PO number, supplier or their reference"
        filters={
          <>
            <BranchFilter state={state} />
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={PURCHASE_STATUSES.map((s) => ({ value: s, label: PURCHASE_STATUS_LABELS[s] }))}
            />
          </>
        }
        emptyTitle="No purchases yet"
        emptyDescription="Record an order to a supplier, or draft one from the low-stock list."
        emptyAction={newButton('sm')}
      />
      <PurchaseDetailModal
        purchaseId={viewId}
        onOpenChange={(o) => !o && closeView()}
        onEdit={(purchase) => {
          closeView();
          setForm({ open: true, purchase });
        }}
      />
      {canManage && (
        <>
          <PurchaseFormDialog
            open={form.open}
            purchase={form.purchase}
            onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          />
          <ReorderDialog open={reorderOpen} onOpenChange={setReorderOpen} onCreated={(p) => setViewId(p.id)} />
        </>
      )}
    </>
  );
}

function PurchaseDetailModal({
  purchaseId,
  onOpenChange,
  onEdit,
}: {
  purchaseId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (p: PurchaseDto) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const pdf = usePdfActions(BASE);
  const [confirm, setConfirm] = useState<'order' | 'cancel' | null>(null);
  const [receiving, setReceiving] = useState(false);
  const canManage = can('purchases.manage');

  const query = useQuery({
    queryKey: [...qk.purchases, 'detail', purchaseId],
    queryFn: ({ signal }) => api.get<PurchaseDto>(`${BASE}/${purchaseId}`, undefined, signal),
    enabled: Boolean(purchaseId),
  });
  const p = query.data;

  const act = async (path: 'order' | 'cancel') => {
    if (!p) return;
    try {
      await run(() => api.post<PurchaseDto>(`${BASE}/${p.id}/${path}`), {
        optimistic: () =>
          patchRecord<PurchaseDto>(queryClient, qk.purchases, p.id, { status: path === 'order' ? 'ordered' : 'cancelled' }),
      });
      void queryClient.invalidateQueries({ queryKey: qk.purchases });
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const details = p && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'Supplier', value: `${p.supplier.name} (${p.supplier.code})` },
          { label: 'Date', value: formatDate(p.purchaseDate) },
          { label: 'Expected', value: p.expectedDate ? formatDate(p.expectedDate) : null },
          { label: 'Receiving branch', value: p.branch?.name },
          { label: 'Supplier reference', value: p.supplierReference },
          { label: 'Prepared by', value: p.preparedBy },
          { label: 'Notes', value: p.notes, wide: true },
        ]}
      />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Ordered</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Unit cost</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {p.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{i.name}</td>
                <td className="px-3 py-2 text-right">
                  {formatQuantity(i.quantity)} {i.unit}
                </td>
                <td className="px-3 py-2 text-right">{formatQuantity(i.receivedQuantity)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(i.unitCost, p.currency)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(i.amount, p.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd>{formatMoney(p.subtotal, p.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Tax ({Number(p.taxRate)}%)</dt>
          <dd>{formatMoney(p.taxAmount, p.currency)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(p.total, p.currency)}</dd>
        </div>
      </dl>
    </div>
  );

  const receipts = p && (
    <div className="space-y-3">
      {p.receipts.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing has been received on this purchase yet.</p>
      ) : (
        p.receipts.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border p-4 text-sm">
            <p className="font-medium text-ink">
              {formatDate(r.receivedDate)} · received by {r.receivedBy}
            </p>
            <ul className="mt-2 space-y-0.5 text-ink-muted">
              {r.lines.map((l, i) => (
                <li key={i}>
                  {formatQuantity(l.quantity)} {l.unit} {l.name}
                </li>
              ))}
            </ul>
            {r.note && <p className="mt-2 text-ink-muted">{r.note}</p>}
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <RecordModal
        open={Boolean(purchaseId)}
        onOpenChange={onOpenChange}
        title={p ? `Purchase ${p.number}` : 'Purchase'}
        subtitle={p?.supplier.name}
        status={p && <PurchaseStatusBadge status={p.status} />}
        reference={p?.number}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        tabs={
          p
            ? [
                { value: 'details', label: 'Details', content: details },
                {
                  value: 'files',
                  label: 'Files',
                  content: <AttachmentsPanel ownerType="purchase" ownerId={p.id} canManage={can('purchases.manage')} />,
                },
                { value: 'receipts', label: `Receipts (${p.receipts.length})`, content: receipts },
                ...(can('purchases.manage')
                  ? [
                      {
                        value: 'email',
                        label: 'Email',
                        content: (
                          <DocumentEmailComposer
                            key={p.id}
                            path={`/purchases/${p.id}`}
                            number={p.number}
                            documentLabel="purchase order"
                            recipientName={p.supplier.name}
                            defaultTo={null}
                            defaultSubject={`Purchase order ${p.number}`}
                            intro={`Please find attached our purchase order ${p.number}.`}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(can('audit.read')
                  ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="purchase" entityId={p.id} /> }]
                  : []),
              ]
            : []
        }
        actions={
          p && (
            <>
              {canManage && p.status === 'draft' && (
                <>
                  <Button variant="secondary" onClick={() => onEdit(p)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm('order')}>
                    <Send aria-hidden /> Mark ordered
                  </Button>
                </>
              )}
              {can('purchases.receive') && (p.status === 'ordered' || p.status === 'partially_received') && (
                <Button variant="secondary" onClick={() => setReceiving(true)}>
                  <PackageCheck aria-hidden /> Receive goods
                </Button>
              )}
              {canManage && (p.status === 'draft' || p.status === 'ordered') && (
                <Button variant="secondary" onClick={() => setConfirm('cancel')}>
                  <Ban aria-hidden /> Cancel
                </Button>
              )}
              <Button variant="secondary" onClick={() => void pdf.print(p)} loading={pdf.isBusy('print', p.id)}>
                <Printer aria-hidden /> Print
              </Button>
              <Button onClick={() => void pdf.download(p)} loading={pdf.isBusy('download', p.id)}>
                <FileDown aria-hidden /> Download PO
              </Button>
            </>
          )
        }
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'order' ? 'Mark this purchase as ordered?' : 'Cancel this purchase?'}
        description={
          confirm === 'order'
            ? 'Do this once the order has gone to the supplier. It can no longer be edited, and goods can then be received against it.'
            : 'It stays in the history but can no longer be ordered or received.'
        }
        confirmLabel={confirm === 'order' ? 'Mark ordered' : 'Cancel purchase'}
        destructive={confirm === 'cancel'}
        onConfirm={() => confirm && act(confirm)}
      />
      {p && <ReceiveDialog open={receiving} onOpenChange={setReceiving} purchase={p} />}
    </>
  );
}

function ReceiveDialog({
  open,
  onOpenChange,
  purchase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: PurchaseDto;
}) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const due = purchase.items.map((i) => ({
    line: i,
    remaining: toDecimal(i.quantity).minus(i.receivedQuantity),
  }));
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Start from "everything still due arrived"; people adjust what didn't.
    setQuantities(Object.fromEntries(due.map((d) => [d.line.id, d.remaining.gt(0) ? d.remaining.toString() : '0'])));
    setDate(todayIso());
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchase.id]);

  const submit = async () => {
    const items = due
      .map((d) => ({ purchaseItemId: d.line.id, quantity: (quantities[d.line.id] ?? '').trim() }))
      .filter((i) => i.quantity !== '' && Number(i.quantity) > 0);
    for (const i of items) {
      const d = due.find((x) => x.line.id === i.purchaseItemId)!;
      if (!/^\d+(\.\d{1,3})?$/.test(i.quantity) || toDecimal(i.quantity).gt(d.remaining)) {
        setError(`Enter up to ${d.remaining.toString()} for ${d.line.name}.`);
        return;
      }
    }
    if (items.length === 0) {
      setError('Enter at least one quantity received.');
      return;
    }
    const body = { receivedDate: date, note: note.trim() || null, items };
    onOpenChange(false);
    try {
      await run(() => api.post<PurchaseDto>(`${BASE}/${purchase.id}/receive`, body, idem.keyFor(body)), {
        optimistic: () => {
          const arrived = new Map(items.map((i) => [i.purchaseItemId, i.quantity]));
          const updated = purchase.items.map((l) => ({
            ...l,
            receivedQuantity: toDecimal(l.receivedQuantity).plus(arrived.get(l.id) ?? 0).toFixed(3),
          }));
          const complete = updated.every((l) => toDecimal(l.receivedQuantity).gte(l.quantity));
          return patchRecord<PurchaseDto>(queryClient, qk.purchases, purchase.id, {
            items: updated,
            status: complete ? 'received' : 'partially_received',
          });
        },
      });
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.purchases });
      void queryClient.invalidateQueries({ queryKey: qk.stockItems });
      void queryClient.invalidateQueries({ queryKey: qk.stockBalances });
    } catch {
      // The error dialog already explained the failure.
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={false}
      size="lg"
      title={`Receive goods on ${purchase.number}`}
      description={`Stock at ${purchase.branch?.name ?? 'the receiving branch'} goes up by the quantities you enter.`}
    >
      <DialogBody className="space-y-4">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Still due</th>
                <th className="px-3 py-2 text-right">Received now</th>
              </tr>
            </thead>
            <tbody>
              {due.map((d) => (
                <tr key={d.line.id} className="border-t border-border">
                  <td className="px-3 py-2">{d.line.name}</td>
                  <td className="px-3 py-2 text-right">
                    {formatQuantity(d.remaining.toString())} {d.line.unit}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={`Quantity of ${d.line.name} received`}
                      className="ml-auto h-9 w-28 text-right"
                      disabled={d.remaining.lte(0)}
                      value={quantities[d.line.id] ?? ''}
                      onChange={(e) => setQuantities((q) => ({ ...q, [d.line.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FormGrid>
          <Field label="Date received" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery note number, damage…" />
          </Field>
        </FormGrid>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button onClick={() => void submit()}>Receive into stock</Button>
      </DialogFooter>
    </FormDialog>
  );
}

function ReorderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (p: PurchaseDto) => void;
}) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const suppliers = useSuppliers(open);
  const [supplierId, setSupplierId] = useState('');

  const submit = async () => {
    if (!supplierId) return;
    const body = { supplierId };
    onOpenChange(false);
    try {
      const created = await run(() => api.post<PurchaseDto>(`${BASE}/reorder`, body, idem.keyFor(body)));
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.purchases });
      onCreated(created);
    } catch {
      // The error dialog already explained the failure.
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={false}
      size="sm"
      title="Draft from low stock"
      description="Creates a draft purchase for every item at or below its reorder level in your branch, topping each up to twice that level. You can edit it before ordering."
    >
      <DialogBody>
        <Field label="Supplier" required>
          <NativeSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Choose a supplier</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button disabled={!supplierId} onClick={() => void submit()}>
          Create draft
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}

type Output = z.output<typeof purchaseInputSchema>;
const blankItem = { stockItemId: '', name: '', quantity: '1', unit: '', unitCost: '' };
const numeric = (v: unknown) => (/^\d+(\.\d+)?$/.test(String(v ?? '').trim()) ? String(v).trim() : '0');

function toValues(p: PurchaseDto | null): PurchaseInput {
  if (!p) {
    return {
      branchId: null,
      supplierId: '',
      purchaseDate: todayIso(),
      expectedDate: null,
      supplierReference: '',
      currency: 'GHS',
      taxRate: '0',
      notes: '',
      items: [{ ...blankItem }],
    };
  }
  return {
    branchId: p.branch?.id ?? null,
    supplierId: p.supplier.id,
    purchaseDate: p.purchaseDate,
    expectedDate: p.expectedDate,
    supplierReference: p.supplierReference ?? '',
    currency: p.currency,
    taxRate: p.taxRate,
    notes: p.notes ?? '',
    items: p.items.map((i) => ({ stockItemId: i.stockItemId, name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
  };
}

function PurchaseFormDialog({
  open,
  onOpenChange,
  purchase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: PurchaseDto | null;
}) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const suppliers = useSuppliers(open);
  const isEdit = Boolean(purchase);
  const recovery = useKeepInput();

  const form = useForm<PurchaseInput, unknown, Output>({ resolver: zodForm(purchaseInputSchema), defaultValues: toValues(purchase) });
  const { errors, isDirty } = form.formState;
  const items = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open && !recovery.restoring()) form.reset(toValues(purchase));
  }, [open, recovery, purchase, form]);

  const watched = form.watch();
  const currency = watched.currency ?? 'GHS';
  const totals = calculateProformaTotals(
    (watched.items ?? []).map((i) => ({ quantity: numeric(i?.quantity), unitPrice: numeric(i?.unitCost) })),
    0,
    numeric(watched.taxRate),
  );

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    const supplier = suppliers.data?.find((s) => s.id === values.supplierId);
    const sums = calculateProformaTotals(
      values.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitCost })),
      0,
      values.taxRate,
    );
    const shown = {
      supplier: supplier ? { id: supplier.id, code: supplier.code, name: supplier.name } : (purchase?.supplier ?? { id: values.supplierId, code: '', name: '' }),
      purchaseDate: values.purchaseDate,
      expectedDate: values.expectedDate ?? null,
      supplierReference: values.supplierReference ?? null,
      currency: values.currency,
      taxRate: values.taxRate,
      subtotal: sums.subtotal,
      taxAmount: sums.taxAmount,
      total: sums.total,
      notes: values.notes ?? null,
      itemCount: values.items.length,
      items: values.items.map((i, index) => ({
        id: pendingId(),
        stockItemId: i.stockItemId,
        name: i.name,
        quantity: i.quantity,
        receivedQuantity: '0.000',
        unit: i.unit,
        unitCost: i.unitCost,
        amount: sums.amounts[index]!,
      })),
    };
    try {
      await run(
        () =>
          isEdit
            ? api.put<PurchaseDto>(`${BASE}/${purchase!.id}`, values)
            : api.post<PurchaseDto>(BASE, values, idem.keyFor(values)),
        {
          optimistic: () =>
            isEdit
              ? patchRecord<PurchaseDto>(queryClient, qk.purchases, purchase!.id, shown)
              : insertRecord<PurchaseDto>(queryClient, qk.purchases, {
                  ...shown,
                  id: pendingId(),
                  number: '…',
                  branch: null,
                  status: 'draft',
                  receipts: [],
                  preparedBy: me?.user.fullName ?? '',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }),
        },
      );
      idem.reset();
      void queryClient.invalidateQueries({ queryKey: qk.purchases });
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
      title={isEdit ? `Edit ${purchase!.number}` : 'New purchase'}
      description="Saved as a draft. Stock changes only when the goods are received."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-6">
          <FormSection title="Order">
            <FormGrid>
              <Field label="Supplier" error={errors.supplierId?.message} required className="sm:col-span-2">
                <NativeSelect {...form.register('supplierId')}>
                  <option value="">Choose a supplier</option>
                  {suppliers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <BranchField
                registration={form.register('branchId', { setValueAs: (v) => v || null })}
                error={errors.branchId?.message}
                current={purchase?.branch?.name}
              />
              <Field label="Order date" error={errors.purchaseDate?.message} required>
                <Input type="date" {...form.register('purchaseDate')} />
              </Field>
              <Field label="Expected delivery" error={errors.expectedDate?.message}>
                <Input type="date" {...form.register('expectedDate', { setValueAs: (v) => v || null })} />
              </Field>
              <Field label="Supplier's reference" error={errors.supplierReference?.message}>
                <Input {...form.register('supplierReference')} />
              </Field>
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
          </FormSection>
          <FormSection title="Items">
            <div className="space-y-3">
              {items.fields.map((field, index) => {
                const e = errors.items?.[index];
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-2 gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[minmax(0,3fr)_90px_90px_110px_110px_auto]"
                  >
                    <Field
                      label="Item"
                      error={e?.stockItemId ? 'Pick an item from the catalogue.' : e?.name?.message}
                      required
                      className="col-span-2 sm:col-span-1"
                    >
                      <Controller
                        control={form.control}
                        name={`items.${index}.name`}
                        render={({ field: f }) => (
                          <ItemNameInput
                            base={BASE}
                            value={f.value}
                            invalid={Boolean(e?.name || e?.stockItemId)}
                            onChange={(text) => {
                              f.onChange(text);
                              form.setValue(`items.${index}.stockItemId`, '');
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
                    </Field>
                    <Field label="Quantity" error={e?.quantity?.message} required>
                      <Input inputMode="decimal" {...form.register(`items.${index}.quantity`)} />
                    </Field>
                    <Field label="Unit" error={e?.unit?.message} required>
                      <Input {...form.register(`items.${index}.unit`)} />
                    </Field>
                    <Field label="Unit cost" error={e?.unitCost?.message} required>
                      <Input inputMode="decimal" {...form.register(`items.${index}.unitCost`)} />
                    </Field>
                    <Field label="Amount">
                      <Input readOnly value={formatMoney(totals.amounts[index] ?? '0.00', currency)} className="bg-surface-muted text-right" />
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
                <dt className="text-ink-muted">Tax</dt>
                <dd>{formatMoney(totals.taxAmount, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatMoney(totals.total, currency)}</dd>
              </div>
            </dl>
            <Field label="Notes" error={errors.notes?.message}>
              <Textarea rows={2} {...form.register('notes')} />
            </Field>
          </FormSection>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{isEdit ? 'Save changes' : 'Create purchase'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
