import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, FileDown, Pencil, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_KIND_LABELS,
  EXPENSE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type ExpenseDto,
  type ExpenseStatus,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { EntityHistory } from '@/components/app/EntityHistory';
import { Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { ExpenseStatusBadge } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { api, downloadFile, errorMessage, printFile } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { COUNTERPARTY_LABEL } from './ExpenseFormDialog';

/** Print and download the record's invoice PDF, tracking which one is busy. */
export function useInvoicePdf() {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (mode: 'print' | 'download', e: Pick<ExpenseDto, 'id' | 'number'>) => {
    setBusy(`${mode}:${e.id}`);
    try {
      if (mode === 'print') await printFile(`/expenses/${e.id}/pdf`);
      else await downloadFile(`/expenses/${e.id}/pdf`, `${e.number}.pdf`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return {
    isBusy: (mode: 'print' | 'download', id: string) => busy === `${mode}:${id}`,
    print: (e: Pick<ExpenseDto, 'id' | 'number'>) => act('print', e),
    download: (e: Pick<ExpenseDto, 'id' | 'number'>) => act('download', e),
  };
}

interface Props {
  expenseId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: ExpenseDto) => void;
}

export function ExpenseDetailModal({ expenseId, onOpenChange, onEdit }: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const pdf = useInvoicePdf();
  const [reasonFor, setReasonFor] = useState<Extract<ExpenseStatus, 'rejected' | 'voided'> | null>(null);
  const canManage = can('expenses.manage');
  const canApprove = can('expenses.approve');

  const query = useQuery({
    queryKey: [...qk.expenses, 'detail', expenseId],
    queryFn: ({ signal }) => api.get<ExpenseDto>(`/expenses/${expenseId}`, undefined, signal),
    enabled: Boolean(expenseId),
  });
  const e = query.data;

  const changeStatus = async (status: ExpenseStatus, reason?: string) => {
    if (!e) return;
    try {
      await run(() => api.post<ExpenseDto>(`/expenses/${e.id}/status`, { status, reason: reason || null }), {
        pending: 'Updating status…',
        success: `Marked as ${EXPENSE_STATUS_LABELS[status].toLowerCase()}`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.expenses });
    } catch {
      // The toast already explained the failure.
    }
  };

  const details = e && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'Amount', value: <span className="font-semibold">{formatMoney(e.amount, e.currency)}</span> },
          { label: 'Date', value: formatDate(e.transactionDate) },
          { label: 'Category', value: e.category },
          { label: COUNTERPARTY_LABEL[e.kind], value: e.counterparty },
          ...(e.kind !== 'general' ? [{ label: 'Tender reference', value: e.tenderReference }] : []),
          { label: 'Payment method', value: PAYMENT_METHOD_LABELS[e.paymentMethod] },
          { label: 'Payment reference', value: e.paymentReference },
          { label: 'Branch', value: e.branch ? `${e.branch.code} — ${e.branch.name}` : 'Company-wide' },
          { label: 'Recorded by', value: `${e.recordedBy} · ${formatDateTime(e.createdAt)}` },
          {
            label: 'Approved by',
            value: e.approvedBy ? `${e.approvedBy}${e.approvedAt ? ` · ${formatDateTime(e.approvedAt)}` : ''}` : null,
          },
          ...(e.statusReason ? [{ label: 'Status note', value: e.statusReason, wide: true }] : []),
          { label: 'Description', value: e.description, wide: true },
        ]}
      />
    </div>
  );

  return (
    <>
      <RecordModal
        open={Boolean(expenseId)}
        onOpenChange={onOpenChange}
        title={e ? `${EXPENSE_KIND_LABELS[e.kind]} ${e.number}` : 'Record'}
        subtitle={e?.counterparty ?? e?.category}
        status={e && <ExpenseStatusBadge status={e.status} />}
        reference={e?.number}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        tabs={
          e
            ? [
                { value: 'details', label: 'Details', content: details },
                ...(can('audit.read')
                  ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="expense" entityId={e.id} /> }]
                  : []),
              ]
            : []
        }
        actions={
          e && (
            <>
              {canManage && e.status === 'pending' && (
                <Button variant="secondary" onClick={() => onEdit(e)}>
                  <Pencil aria-hidden /> Edit
                </Button>
              )}
              {canApprove && e.status === 'pending' && (
                <>
                  <Button variant="secondary" onClick={() => setReasonFor('rejected')}>
                    <X aria-hidden /> Reject
                  </Button>
                  <Button variant="secondary" onClick={() => void changeStatus('approved')}>
                    <Check aria-hidden /> Approve
                  </Button>
                </>
              )}
              {canApprove && e.status === 'approved' && (
                <Button variant="secondary" onClick={() => setReasonFor('voided')}>
                  <Ban aria-hidden /> Void
                </Button>
              )}
              <Button variant="secondary" onClick={() => void pdf.print(e)} loading={pdf.isBusy('print', e.id)}>
                <Printer aria-hidden /> Print
              </Button>
              <Button onClick={() => void pdf.download(e)} loading={pdf.isBusy('download', e.id)}>
                <FileDown aria-hidden /> Generate Invoice
              </Button>
            </>
          )
        }
      />
      <ReasonDialog
        status={reasonFor}
        onClose={() => setReasonFor(null)}
        onConfirm={(status, reason) => {
          setReasonFor(null);
          void changeStatus(status, reason);
        }}
      />
    </>
  );
}

function ReasonDialog({
  status,
  onClose,
  onConfirm,
}: {
  status: 'rejected' | 'voided' | null;
  onClose: () => void;
  onConfirm: (status: 'rejected' | 'voided', reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const voiding = status === 'voided';
  return (
    <Dialog
      open={status !== null}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{voiding ? 'Void this record' : 'Reject this record'}</DialogTitle>
          <DialogDescription>
            {voiding
              ? 'A voided record stays in the history but no longer counts in totals. This cannot be undone.'
              : 'A rejected record stays in the history and cannot be approved later.'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!status) return;
            if (!reason.trim()) {
              setError('Give a reason.');
              return;
            }
            onConfirm(status, reason.trim());
            setReason('');
            setError(null);
          }}
        >
          <DialogBody>
            <Field label="Reason" error={error ?? undefined} required>
              <Textarea autoFocus rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="destructive">
              {voiding ? 'Void record' : 'Reject record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
