import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FileDown, Pencil, Printer, Send } from 'lucide-react';
import { ACCEPTANCE_STATUS_LABELS, type AcceptanceDto, type AcceptanceStatus } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { ConfirmDialog } from '@/components/app/dialogs';
import { EntityHistory } from '@/components/app/EntityHistory';
import { useOperation } from '@/components/app/OperationFeedback';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { AcceptanceStatusBadge } from '@/components/app/StatusBadges';
import { usePdfActions } from '@/components/app/usePdfActions';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

interface Props {
  letterId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (letter: AcceptanceDto) => void;
}

export function AcceptanceDetailModal({ letterId, onOpenChange, onEdit }: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const pdf = usePdfActions('/acceptance-letters');
  const [confirm, setConfirm] = useState<Exclude<AcceptanceStatus, 'draft'> | null>(null);
  const canManage = can('acceptance.manage');

  const query = useQuery({
    queryKey: [...qk.acceptanceLetters, 'detail', letterId],
    queryFn: ({ signal }) => api.get<AcceptanceDto>(`/acceptance-letters/${letterId}`, undefined, signal),
    enabled: Boolean(letterId),
  });
  const l = query.data;

  const changeStatus = async (status: AcceptanceStatus) => {
    if (!l) return;
    try {
      await run(() => api.patch<AcceptanceDto>(`/acceptance-letters/${l.id}/status`, { status }), {
        pending: 'Updating status…',
        success: `Marked as ${ACCEPTANCE_STATUS_LABELS[status].toLowerCase()}`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.acceptanceLetters });
    } catch {
      // The toast already explained the failure.
    }
  };

  const details = l && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'To', value: l.recipientName },
          { label: 'Date', value: formatDate(l.letterDate) },
          { label: 'Your ref', value: l.yourReference },
          { label: 'Contract number', value: l.contractNumber },
          { label: 'Award letter dated', value: l.awardLetterDate ? formatDate(l.awardLetterDate) : null },
          { label: 'Supply of', value: l.supplyDescription },
          { label: 'Price schedule', value: l.tender?.number },
          { label: 'Prepared by', value: l.preparedBy },
          { label: 'Address', value: l.recipientAddress, wide: true },
        ]}
      />
      <article className="space-y-3 rounded-2xl border border-border p-5 text-sm text-ink">
        <p>Dear Sir/Madam,</p>
        <p className="text-center font-semibold underline">{l.subject}</p>
        <p className="whitespace-pre-line">{l.body}</p>
        <p>Yours faithfully,</p>
        <p>
          <span className="font-semibold uppercase">{l.signatoryName}</span>
          {l.signatoryTitle && <span className="block text-ink-muted">({l.signatoryTitle})</span>}
        </p>
      </article>
    </div>
  );

  return (
    <>
      <RecordModal
        open={Boolean(letterId)}
        onOpenChange={onOpenChange}
        title={l ? `Acceptance letter ${l.number}` : 'Acceptance letter'}
        subtitle={l?.recipientName}
        status={l && <AcceptanceStatusBadge status={l.status} />}
        reference={l?.number}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        tabs={
          l
            ? [
                { value: 'details', label: 'Letter', content: details },
                ...(can('audit.read')
                  ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="acceptance" entityId={l.id} /> }]
                  : []),
              ]
            : []
        }
        actions={
          l && (
            <>
              {canManage && l.status === 'draft' && (
                <>
                  <Button variant="secondary" onClick={() => onEdit(l)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm('issued')}>
                    <Send aria-hidden /> Mark issued
                  </Button>
                </>
              )}
              {canManage && l.status !== 'cancelled' && (
                <Button variant="secondary" onClick={() => setConfirm('cancelled')}>
                  <Ban aria-hidden /> Cancel letter
                </Button>
              )}
              <Button variant="secondary" onClick={() => void pdf.print(l)} loading={pdf.isBusy('print', l.id)}>
                <Printer aria-hidden /> Print
              </Button>
              <Button onClick={() => void pdf.download(l)} loading={pdf.isBusy('download', l.id)}>
                <FileDown aria-hidden /> Download PDF
              </Button>
            </>
          )
        }
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'issued' ? 'Mark this letter as issued?' : 'Cancel this letter?'}
        description={
          confirm === 'issued'
            ? 'Do this once the letter has been sent to the client. An issued letter can no longer be edited.'
            : 'A cancelled letter stays in the history but cannot be reopened. Create a new letter if you need one.'
        }
        confirmLabel={confirm === 'issued' ? 'Mark issued' : 'Cancel letter'}
        destructive={confirm === 'cancelled'}
        onConfirm={() => confirm && changeStatus(confirm)}
      />
    </>
  );
}
