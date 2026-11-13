import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileDown, Plus, Printer, Undo2 } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, type PaymentDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { AttachmentsPanel } from '@/components/app/AttachmentsPanel';
import { useOpenParam } from '@/components/app/useOpenParam';
import { DocumentEmailComposer } from '@/components/app/DocumentEmailComposer';
import { BranchFilter } from '@/components/app/BranchControls';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { ReasonDialog } from '@/components/app/dialogs';
import { EntityHistory } from '@/components/app/EntityHistory';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { PaymentStatusBadge } from '@/components/app/StatusBadges';
import { usePdfActions } from '@/components/app/usePdfActions';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { patchRecord } from '@/lib/optimistic';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { PaymentFormDialog } from './PaymentFormDialog';

export default function PaymentsPage() {
  const { can } = useAuth();
  const state = useTableState(['status', 'branchId'], { sort: 'paymentDate:desc' });
  const rowPdf = usePdfActions('/payments');
  const result = useListQuery<PaymentDto>(qk.payments, '/payments', state.query);
  const [viewId, setViewId, closeView] = useOpenParam();
  const [formOpen, setFormOpen] = useState(false);
  const canRecord = can('payments.record');
  const right = { align: 'right' as const, headerClassName: 'text-right' };

  const columns: ColumnDef<PaymentDto>[] = [
    {
      id: 'number',
      header: 'Receipt No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    { id: 'paymentDate', header: 'Date', meta: { sortKey: 'paymentDate' }, cell: ({ row }) => formatDate(row.original.paymentDate) },
    { id: 'client', header: 'Client', cell: ({ row }) => row.original.customerName },
    { id: 'sale', header: 'Sale', cell: ({ row }) => row.original.sale.number },
    { id: 'method', header: 'Method', cell: ({ row }) => PAYMENT_METHOD_LABELS[row.original.method] },
    {
      id: 'amount',
      header: 'Amount',
      meta: { ...right, sortKey: 'amount' },
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.amount, row.original.currency)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    },
  ];

  const newButton = (size?: 'sm') =>
    canRecord && (
      <Button size={size} onClick={() => setFormOpen(true)}>
        <Plus aria-hidden /> Record payment
      </Button>
    );

  return (
    <>
      <PageHeader
        title="Payment"
        description="Money received from customers against confirmed sales. A mistake is reversed, never edited."
        actions={newButton()}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(p) => p.id}
        onRowClick={(p) => setViewId(p.id)}
        rowActions={(p) => [
          { label: 'Download receipt', icon: <FileDown />, onSelect: () => void rowPdf.download(p) },
        ]}
        caption="Payments"
        searchPlaceholder="Search receipt, reference, sale or client"
        filters={
          <>
            <BranchFilter state={state} />
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))}
            />
          </>
        }
        emptyTitle="No payments yet"
        emptyDescription="Payments appear here once they are recorded against a confirmed sale."
        emptyAction={newButton('sm')}
      />
      <PaymentDetailModal paymentId={viewId} onOpenChange={(o) => !o && closeView()} />
      {canRecord && <PaymentFormDialog open={formOpen} onOpenChange={setFormOpen} />}
    </>
  );
}

function PaymentDetailModal({
  paymentId,
  onOpenChange,
}: {
  paymentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const pdf = usePdfActions('/payments');
  const [reversing, setReversing] = useState(false);

  const query = useQuery({
    queryKey: [...qk.payments, 'detail', paymentId],
    queryFn: ({ signal }) => api.get<PaymentDto>(`/payments/${paymentId}`, undefined, signal),
    enabled: Boolean(paymentId),
  });
  const p = query.data;

  const reverse = async (reason: string) => {
    if (!p) return;
    try {
      await run(() => api.post<PaymentDto>(`/payments/${p.id}/reverse`, { reason }), {
        optimistic: () =>
          patchRecord<PaymentDto>(queryClient, qk.payments, p.id, { status: 'reversed', reverseReason: reason }),
      });
      void queryClient.invalidateQueries({ queryKey: qk.payments });
      void queryClient.invalidateQueries({ queryKey: qk.sales });
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const details = p && (
    <DetailList
      items={[
        { label: 'Amount', value: <span className="font-semibold">{formatMoney(p.amount, p.currency)}</span> },
        { label: 'Date', value: formatDate(p.paymentDate) },
        { label: 'Client', value: p.customerName },
        { label: 'Sale', value: p.sale.number },
        { label: 'Sale total', value: formatMoney(p.sale.total, p.currency) },
        { label: 'Balance outstanding', value: formatMoney(p.sale.balance, p.currency) },
        { label: 'Method', value: PAYMENT_METHOD_LABELS[p.method] },
        { label: 'Reference', value: p.externalReference },
        { label: 'Branch', value: p.branch?.name },
        { label: 'Recorded by', value: p.recordedBy },
        { label: 'Notes', value: p.notes, wide: true },
        ...(p.reverseReason ? [{ label: 'Reversed because', value: p.reverseReason, wide: true }] : []),
      ]}
    />
  );

  return (
    <>
      <RecordModal
        open={Boolean(paymentId)}
        onOpenChange={onOpenChange}
        title={p ? `Receipt ${p.number}` : 'Payment'}
        subtitle={p?.customerName}
        status={p && <PaymentStatusBadge status={p.status} />}
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
                  content: <AttachmentsPanel ownerType="payment" ownerId={p.id} canManage={can('payments.record')} />,
                },
                ...(can('payments.record')
                  ? [
                      {
                        value: 'email',
                        label: 'Email',
                        content: (
                          <DocumentEmailComposer
                            key={p.id}
                            path={`/payments/${p.id}`}
                            number={p.number}
                            documentLabel="receipt"
                            recipientName={p.customerName}
                            defaultTo={null}
                            defaultSubject={`Receipt ${p.number}`}
                            intro={`Thank you for your payment of ${formatMoney(p.amount, p.currency)}. Your receipt ${p.number} is attached.`}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(can('audit.read')
                  ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="payment" entityId={p.id} /> }]
                  : []),
              ]
            : []
        }
        actions={
          p && (
            <>
              {p.status === 'posted' && can('payments.reverse') && (
                <Button variant="secondary" onClick={() => setReversing(true)}>
                  <Undo2 aria-hidden /> Reverse
                </Button>
              )}
              <Button onClick={() => void pdf.print(p)} loading={pdf.isBusy('print', p.id)}>
                <Printer aria-hidden /> Print
              </Button>
            </>
          )
        }
      />
      <ReasonDialog
        open={reversing}
        onOpenChange={setReversing}
        title="Reverse this payment?"
        description="The sale's balance goes back up by this amount. The payment stays in the history, marked reversed."
        label="Reason"
        confirmLabel="Reverse payment"
        destructive
        onConfirm={(reason) => void reverse(reason)}
      />
    </>
  );
}
