import { useEffect, useState } from 'react';
import { FileDown, Printer, Search } from 'lucide-react';
import { reportFailure } from '@/components/app/OperationFeedback';
import type { ProformaDto } from '@tsm/shared';
import { ProformaStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadFile, errorMessage, printFile } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick an existing proforma and download it as an A4 PDF. */
export function GenerateInvoiceDialog({ open, onOpenChange }: Props) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const result = useListQuery<ProformaDto>(
    [...qk.proformas, 'picker'],
    '/proformas',
    { page: 1, pageSize: 10, sort: 'issueDate:desc', q },
    open,
  );
  const rows = result.data?.data ?? [];

  const download = async (p: ProformaDto) => {
    setBusyId(`download:${p.id}`);
    try {
      await downloadFile(`/proformas/${p.id}/pdf`, `${p.number}.pdf`);
    } catch (error) {
      reportFailure(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const print = async (p: ProformaDto) => {
    setBusyId(`print:${p.id}`);
    try {
      await printFile(`/proformas/${p.id}/pdf`);
    } catch (error) {
      reportFailure(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
          <DialogDescription>Choose a proforma to print or download as an A4 PDF.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input
              autoFocus
              aria-label="Search proformas"
              placeholder="Search invoice number or customer"
              className="pl-9"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {result.isError ? (
            <ErrorState message={errorMessage(result.error)} onRetry={() => void result.refetch()} />
          ) : result.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No proformas found" description={q ? 'Try a different search.' : 'Create a proforma first.'} />
          ) : (
            <ul className="space-y-2">
              {rows.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.number}</span>
                      <ProformaStatusBadge status={p.status} />
                    </div>
                    <p className="truncate text-xs text-ink-muted">
                      {p.customerName} · {formatDate(p.issueDate)} · {formatMoney(p.total, p.currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === `print:${p.id}`}
                      onClick={() => void print(p)}
                    >
                      <Printer aria-hidden /> Print
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === `download:${p.id}`}
                      onClick={() => void download(p)}
                    >
                      <FileDown aria-hidden /> Download
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
