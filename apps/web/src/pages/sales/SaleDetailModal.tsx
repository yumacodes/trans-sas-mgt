import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Banknote, CheckCircle2, FileDown, Pencil, Printer, Truck } from 'lucide-react';
import type { SaleDto, WaybillDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { ConfirmDialog, ReasonDialog } from '@/components/app/dialogs';
import { EntityHistory } from '@/components/app/EntityHistory';
import { useOperation } from '@/components/app/OperationFeedback';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { SaleStatusBadge } from '@/components/app/StatusBadges';
import { usePdfActions } from '@/components/app/usePdfActions';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import { patchRecord } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { PaymentFormDialog } from '@/pages/payments/PaymentFormDialog';

interface Props {
  saleId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (sale: SaleDto) => void;
}

export function SaleDetailModal({ saleId, onOpenChange, onEdit }: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const navigate = useNavigate();
  const pdf = usePdfActions('/sales');
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const canManage = can('sales.manage');

  const query = useQuery({
    queryKey: [...qk.sales, 'detail', saleId],
    queryFn: ({ signal }) => api.get<SaleDto>(`/sales/${saleId}`, undefined, signal),
    enabled: Boolean(saleId),
  });
  const s = query.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.sales });
    void queryClient.invalidateQueries({ queryKey: qk.stockItems });
    void queryClient.invalidateQueries({ queryKey: qk.stockBalances });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
  };

  const confirm = async () => {
    if (!s) return;
    try {
      await run(() => api.post<SaleDto>(`/sales/${s.id}/confirm`), {
        optimistic: () => patchRecord<SaleDto>(queryClient, qk.sales, s.id, { status: 'confirmed' }),
      });
      refresh();
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const cancel = async (reason: string) => {
    if (!s) return;
    try {
      await run(() => api.post<SaleDto>(`/sales/${s.id}/cancel`, { reason }), {
        optimistic: () => patchRecord<SaleDto>(queryClient, qk.sales, s.id, { status: 'cancelled', cancelReason: reason }),
      });
      refresh();
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const makeWaybill = async () => {
    if (!s) return;
    try {
      const waybill = await run(() => api.post<WaybillDto>(`/waybills/from-sale/${s.id}`));
      void queryClient.invalidateQueries({ queryKey: qk.waybills });
      onOpenChange(false);
      void navigate(`/waybills?open=${waybill.id}`);
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const details = s && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'Client', value: s.customerName },
          { label: 'Sale date', value: formatDate(s.saleDate) },
          { label: 'Due date', value: s.dueDate ? formatDate(s.dueDate) : null },
          { label: 'Branch', value: s.branch?.name },
          { label: 'Email', value: s.customerEmail },
          { label: 'Phone', value: s.customerPhone },
          { label: 'From proforma', value: s.proforma?.number },
          { label: 'From price schedule', value: s.tender?.number },
          { label: 'Prepared by', value: s.preparedBy },
          { label: 'Address', value: s.customerAddress, wide: true },
          ...(s.cancelReason ? [{ label: 'Cancelled because', value: s.cancelReason, wide: true }] : []),
        ]}
      />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{i.name}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(i.quantity)}</td>
                <td className="px-3 py-2">{i.unit}</td>
                <td className="px-3 py-2 text-right">{formatMoney(i.unitPrice, s.currency)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(i.amount, s.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd>{formatMoney(s.subtotal, s.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Tax ({Number(s.taxRate)}%)</dt>
          <dd>{formatMoney(s.taxAmount, s.currency)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(s.total, s.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Paid</dt>
          <dd>{formatMoney(s.paidAmount, s.currency)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Balance</dt>
          <dd>{formatMoney(s.balance, s.currency)}</dd>
        </div>
      </dl>
      {s.notes && <p className="whitespace-pre-line text-sm text-ink">{s.notes}</p>}
    </div>
  );

  return (
    <>
      <RecordModal
        open={Boolean(saleId)}
        onOpenChange={onOpenChange}
        title={s ? `Sale ${s.number}` : 'Sale'}
        subtitle={s?.customerName}
        status={s && <SaleStatusBadge status={s.status} />}
        reference={s?.number}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        tabs={
          s
            ? [
                { value: 'details', label: 'Details', content: details },
                ...(can('audit.read')
                  ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="sale" entityId={s.id} /> }]
                  : []),
              ]
            : []
        }
        actions={
          s && (
            <>
              {canManage && s.status === 'draft' && (
                <>
                  <Button variant="secondary" onClick={() => onEdit(s)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(true)}>
                    <CheckCircle2 aria-hidden /> Confirm sale
                  </Button>
                </>
              )}
              {s.status === 'confirmed' && can('waybills.manage') && (
                <Button variant="secondary" onClick={() => void makeWaybill()}>
                  <Truck aria-hidden /> Make waybill
                </Button>
              )}
              {s.status === 'confirmed' && can('payments.record') && Number(s.balance) > 0 && (
                <Button variant="secondary" onClick={() => setPaying(true)}>
                  <Banknote aria-hidden /> Record payment
                </Button>
              )}
              {s.status !== 'cancelled' && can('sales.cancel') && (
                <Button variant="secondary" onClick={() => setCancelling(true)}>
                  <Ban aria-hidden /> Cancel sale
                </Button>
              )}
              <Button variant="secondary" onClick={() => void pdf.print(s)} loading={pdf.isBusy('print', s.id)}>
                <Printer aria-hidden /> Print
              </Button>
              <Button onClick={() => void pdf.download(s)} loading={pdf.isBusy('download', s.id)}>
                <FileDown aria-hidden /> Download PDF
              </Button>
            </>
          )
        }
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Confirm this sale?"
        description="Its stock will be taken off the branch's balance straight away, and it can then take payments. The sale can no longer be edited."
        confirmLabel="Confirm sale"
        onConfirm={() => confirm()}
      />
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this sale?"
        description={
          s?.status === 'confirmed'
            ? 'Its stock will be returned to the branch. A cancelled sale stays in the history.'
            : 'A cancelled sale stays in the history.'
        }
        label="Reason"
        confirmLabel="Cancel sale"
        destructive
        onConfirm={(reason) => void cancel(reason)}
      />
      {s && <PaymentFormDialog open={paying} onOpenChange={setPaying} sale={s} />}
    </>
  );
}
