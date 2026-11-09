import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Paperclip, Printer, Send, X } from 'lucide-react';
import {
  PROFORMA_EMAIL_MAX_FILES,
  PROFORMA_EMAIL_MAX_FILE_BYTES,
  PROFORMA_STATUSES,
  PROFORMA_STATUS_LABELS,
  type ProformaDto,
  type ProformaStatus,
} from '@tsm/shared';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import { ProformaStatusBadge } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api, downloadFile, errorMessage, printFile } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function EmailComposer({ proforma, onSent }: { proforma: ProformaDto; onSent: () => void }) {
  const { me } = useAuth();
  const { run } = useOperation();
  const [to, setTo] = useState(proforma.customerEmail ?? '');
  const [subject, setSubject] = useState(`Proforma Invoice ${proforma.number}`);
  const [body, setBody] = useState(
    `Dear ${proforma.customerName},\n\nPlease find attached proforma invoice ${proforma.number} for ${formatMoney(proforma.total, proforma.currency)}.\n\nKind regards,\n${me?.user.fullName ?? proforma.preparedBy}`,
  );
  const [attachInvoice, setAttachInvoice] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)];
    if (next.length > PROFORMA_EMAIL_MAX_FILES) {
      setErrors({ files: `Attach up to ${PROFORMA_EMAIL_MAX_FILES} files.` });
      return;
    }
    const tooBig = next.find((f) => f.size > PROFORMA_EMAIL_MAX_FILE_BYTES);
    if (tooBig) {
      setErrors({ files: `"${tooBig.name}" is larger than ${fileSize(PROFORMA_EMAIL_MAX_FILE_BYTES)}.` });
      return;
    }
    setErrors({});
    setFiles(next);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) found.to = 'Enter a valid email address.';
    if (!subject.trim()) found.subject = 'Subject is required.';
    if (!body.trim()) found.body = 'Write a message.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = new FormData();
    data.set('to', to.trim());
    data.set('subject', subject.trim());
    data.set('body', body);
    data.set('attachInvoice', String(attachInvoice));
    for (const f of files) data.append('files', f);
    setFiles([]);
    try {
      await run(() => api.upload<ProformaDto>(`/proformas/${proforma.id}/email`, data), {
        pending: 'Sending email…',
        success: 'Email sent',
      });
      // Refresh only once the server has answered: sending moves a draft to "issued".
      onSent();
    } catch {
      // The toast already explained the failure.
    }
  };

  return (
    <form onSubmit={send} noValidate className="space-y-4">
      <Field label="To" error={errors.to} required>
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Field label="Subject" error={errors.subject} required>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message" error={errors.body} required>
        <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={attachInvoice} onCheckedChange={(v) => setAttachInvoice(v === true)} />
        Attach the invoice PDF ({proforma.number}.pdf)
      </label>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <label className="cursor-pointer">
              <Paperclip aria-hidden /> Add files
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </Button>
          <span className="text-xs text-ink-subtle">
            Up to {PROFORMA_EMAIL_MAX_FILES} files, {fileSize(PROFORMA_EMAIL_MAX_FILE_BYTES)} each
          </span>
        </div>
        {errors.files && (
          <p role="alert" className="text-xs text-danger">
            {errors.files}
          </p>
        )}
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-1.5 text-sm">
                <span className="truncate">
                  {f.name} <span className="text-xs text-ink-subtle">{fileSize(f.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="text-ink-subtle hover:text-ink"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="submit">
        <Send aria-hidden /> Send email
      </Button>
    </form>
  );
}

interface Props {
  proformaId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ProformaDetailModal({ proformaId, onOpenChange }: Props) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const canManage = can('proformas.manage');

  const query = useQuery({
    queryKey: [...qk.proformas, 'detail', proformaId],
    queryFn: ({ signal }) => api.get<ProformaDto>(`/proformas/${proformaId}`, undefined, signal),
    enabled: Boolean(proformaId),
  });
  const p = query.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.proformas });
  };

  const generate = async () => {
    if (!p) return;
    setDownloading(true);
    try {
      await downloadFile(`/proformas/${p.id}/pdf`, `${p.number}.pdf`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const print = async () => {
    if (!p) return;
    setPrinting(true);
    try {
      await printFile(`/proformas/${p.id}/pdf`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPrinting(false);
    }
  };

  const changeStatus = async (status: ProformaStatus) => {
    if (!p) return;
    try {
      await run(() => api.patch<ProformaDto>(`/proformas/${p.id}/status`, { status }), {
        pending: 'Updating status…',
        success: `Marked as ${PROFORMA_STATUS_LABELS[status].toLowerCase()}`,
      });
      refresh();
    } catch {
      /* the feedback dialog already explained the failure */
    }
  };

  const details = p && (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'Customer', value: p.customerName },
          { label: 'Invoice date', value: formatDate(p.issueDate) },
          { label: 'Address', value: p.customerAddress, wide: true },
          { label: 'Email', value: p.customerEmail },
          { label: 'Phone', value: p.customerPhone },
          { label: 'Prepared by', value: p.preparedBy },
          { label: 'Last emailed', value: p.emailedAt ? formatDateTime(p.emailedAt) : 'Not emailed yet' },
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
            {p.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2">{i.name}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(i.quantity)}</td>
                <td className="px-3 py-2">{i.unit}</td>
                <td className="px-3 py-2 text-right">{formatMoney(i.unitPrice, p.currency)}</td>
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
          <dt className="text-ink-muted">VAT ({Number(p.vatRate)}%)</dt>
          <dd>{formatMoney(p.vatAmount, p.currency)}</dd>
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
      {p.notes && <p className="whitespace-pre-line text-sm text-ink">{p.notes}</p>}
      {canManage && (
        <Field label="Status">
          <NativeSelect value={p.status} onChange={(e) => void changeStatus(e.target.value as ProformaStatus)}>
            {PROFORMA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROFORMA_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
    </div>
  );

  return (
    <RecordModal
      open={Boolean(proformaId)}
      onOpenChange={onOpenChange}
      title={p ? `Proforma ${p.number}` : 'Proforma'}
      subtitle={p?.customerName}
      status={p && <ProformaStatusBadge status={p.status} />}
      reference={p?.number}
      loading={query.isLoading}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      tabs={
        p
          ? [
              { value: 'details', label: 'Details', content: details },
              ...(canManage
                ? [
                    {
                      value: 'email',
                      label: 'Email',
                      content: <EmailComposer key={p.id} proforma={p} onSent={refresh} />,
                    },
                  ]
                : []),
            ]
          : []
      }
      actions={
        p && (
          <>
            <Button variant="secondary" onClick={() => void print()} loading={printing}>
              <Printer aria-hidden /> Print
            </Button>
            <Button onClick={() => void generate()} loading={downloading}>
              <FileDown aria-hidden /> Generate Invoice
            </Button>
          </>
        )
      }
    />
  );
}
