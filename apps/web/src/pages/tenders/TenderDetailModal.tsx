import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Copy, FileDown, FileSignature, Pencil, Printer, ShoppingCart } from 'lucide-react';
import { TENDER_STATUSES, TENDER_STATUS_LABELS, type SaleDto, type TenderDto, type TenderStatus } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { AttachmentsPanel } from '@/components/app/AttachmentsPanel';
import { DocumentEmailComposer } from '@/components/app/DocumentEmailComposer';
import { EntityHistory } from '@/components/app/EntityHistory';
import { Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { TenderStatusBadge } from '@/components/app/StatusBadges';
import { usePdfActions } from '@/components/app/usePdfActions';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import { patchRecord } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';

interface Props {
  tenderId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (tender: TenderDto) => void;
}

export function TenderDetailModal({ tenderId, onOpenChange, onEdit }: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const navigate = useNavigate();
  const pdf = usePdfActions('/tenders');
  const canManage = can('tenders.manage');

  const query = useQuery({
    queryKey: [...qk.tenders, 'detail', tenderId],
    queryFn: ({ signal }) => api.get<TenderDto>(`/tenders/${tenderId}`, undefined, signal),
    enabled: Boolean(tenderId),
  });
  const t = query.data;

  const changeStatus = async (status: TenderStatus) => {
    if (!t) return;
    try {
      await run(() => api.patch<TenderDto>(`/tenders/${t.id}/status`, { status }), {
        optimistic: () => patchRecord<TenderDto>(queryClient, qk.tenders, t.id, { status }),
        pending: 'Updating status…',
        success: `Marked as ${TENDER_STATUS_LABELS[status].toLowerCase()}`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.tenders });
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const convert = async (path: string, page: string) => {
    try {
      const made = await run(() => api.post<{ id: string }>(path));
      void queryClient.invalidateQueries({ queryKey: qk.tenders });
      void queryClient.invalidateQueries({ queryKey: qk.acceptanceLetters });
      onOpenChange(false);
      void navigate(`${page}?open=${made.id}`);
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const makeSale = async () => {
    if (!t) return;
    try {
      const sale = await run(() => api.post<SaleDto>(`/sales/from-tender/${t.id}`));
      void queryClient.invalidateQueries({ queryKey: qk.sales });
      onOpenChange(false);
      void navigate(`/sales?open=${sale.id}`);
    } catch {
      // The error dialog already explained the failure.
    }
  };

  const details = t && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'To', value: t.customerName },
          { label: 'Date', value: formatDate(t.scheduleDate) },
          { label: 'Tender reference', value: t.tenderReference },
          { label: 'Submission deadline', value: t.submissionDeadline ? formatDate(t.submissionDeadline) : null },
          { label: 'Lot', value: t.lot },
          { label: 'Prepared by', value: t.preparedBy },
          { label: 'Address', value: t.customerAddress, wide: true },
        ]}
      />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-muted text-left text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              <th className="px-3 py-2 text-right">Total incl. {t.taxLabel}</th>
              <th className="px-3 py-2">Origin</th>
              <th className="px-3 py-2">Manufacturer</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {t.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{i.description}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(i.quantity)}</td>
                <td className="px-3 py-2">{i.unit}</td>
                <td className="px-3 py-2 text-right">{formatMoney(i.unitPrice, t.currency)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatMoney(i.amountWithTax, t.currency)}</td>
                <td className="px-3 py-2">{i.countryOfOrigin ?? '—'}</td>
                <td className="px-3 py-2">{i.manufacturer ?? '—'}</td>
                <td className="px-3 py-2">{i.brand ?? '—'}</td>
                <td className="px-3 py-2">{i.expiryDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd>{formatMoney(t.subtotal, t.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">
            {t.taxLabel} ({Number(t.taxRate)}%)
          </dt>
          <dd>{formatMoney(t.taxAmount, t.currency)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <dt>Grand total</dt>
          <dd>{formatMoney(t.total, t.currency)}</dd>
        </div>
      </dl>
      <p className="text-xs text-ink-muted">{t.totalInWords}</p>
      {t.notes && <p className="whitespace-pre-line text-sm text-ink">{t.notes}</p>}
      {canManage && (
        <Field label="Status" hint="Mark it awarded only once the award letter has arrived.">
          <NativeSelect value={t.status} onChange={(e) => void changeStatus(e.target.value as TenderStatus)}>
            {TENDER_STATUSES.filter((s) => s !== 'draft' || t.status === 'draft').map((s) => (
              <option key={s} value={s}>
                {TENDER_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
    </div>
  );

  return (
    <RecordModal
      open={Boolean(tenderId)}
      onOpenChange={onOpenChange}
      title={t ? `Price schedule ${t.number}` : 'Price schedule'}
      subtitle={t?.customerName}
      status={t && <TenderStatusBadge status={t.status} />}
      reference={t?.number}
      loading={query.isLoading}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      tabs={
        t
          ? [
              { value: 'details', label: 'Details', content: details },
                {
                  value: 'files',
                  label: 'Files',
                  content: <AttachmentsPanel ownerType="tender" ownerId={t.id} canManage={can('tenders.manage')} />,
                },
                ...(can('tenders.manage')
                  ? [
                      {
                        value: 'email',
                        label: 'Email',
                        content: (
                          <DocumentEmailComposer
                            key={t.id}
                            path={`/tenders/${t.id}`}
                            number={t.number}
                            documentLabel="price schedule"
                            recipientName={t.customerName}
                            defaultTo={null}
                            defaultSubject={`Price schedule ${t.number}`}
                            intro={`Please find attached our price schedule ${t.number}.`}
                          />
                        ),
                      },
                    ]
                  : []),
              ...(can('audit.read')
                ? [{ value: 'history', label: 'History', content: <EntityHistory entityType="tender" entityId={t.id} /> }]
                : []),
            ]
          : []
      }
      actions={
        t && (
          <>
            {canManage && (
              <Button variant="secondary" onClick={() => void convert(`/tenders/${t.id}/duplicate`, '/tender-schedule')}>
                <Copy aria-hidden /> Duplicate
              </Button>
            )}
            {t.status === 'awarded' && can('acceptance.manage') && (
              <Button variant="secondary" onClick={() => void convert(`/acceptance-letters/from-tender/${t.id}`, '/acceptance-letters')}>
                <FileSignature aria-hidden /> Acceptance letter
              </Button>
            )}
            {t.status === 'awarded' && can('sales.manage') && (
              <Button variant="secondary" onClick={() => void makeSale()}>
                <ShoppingCart aria-hidden /> Create sale
              </Button>
            )}
            {canManage && t.status === 'draft' && (
              <Button variant="secondary" onClick={() => onEdit(t)}>
                <Pencil aria-hidden /> Edit
              </Button>
            )}
            <Button variant="secondary" onClick={() => void pdf.print(t)} loading={pdf.isBusy('print', t.id)}>
              <Printer aria-hidden /> Print
            </Button>
            <Button onClick={() => void pdf.download(t)} loading={pdf.isBusy('download', t.id)}>
              <FileDown aria-hidden /> Download PDF
            </Button>
          </>
        )
      }
    />
  );
}
