import { useEffect, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import { PdfPreviewDialog } from '@/components/app/PdfPreviewDialog';
import type { ProformaDto } from '@tsm/shared';
import { ProformaStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick an existing proforma and preview its A4 PDF, with print and download. */
export function GenerateInvoiceDialog({ open, onOpenChange }: Props) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<ProformaDto | null>(null);

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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Choose a proforma to preview its PDF, then print or download it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
                aria-hidden
              />
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
              <ErrorState
                message={errorMessage(result.error)}
                onRetry={() => void result.refetch()}
              />
            ) : result.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No proformas found"
                description={q ? 'Try a different search.' : 'Create a proforma first.'}
              />
            ) : (
              <ul className="space-y-2">
                {rows.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.number}</span>
                        <ProformaStatusBadge status={p.status} />
                      </div>
                      <p className="truncate text-xs text-ink-muted">
                        {p.customerName} · {formatDate(p.issueDate)} ·{' '}
                        {formatMoney(p.total, p.currency)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => setPreview(p)}
                    >
                      <Eye aria-hidden /> Preview
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <PdfPreviewDialog
        path={preview ? `/proformas/${preview.id}/pdf` : null}
        title={preview ? `Invoice ${preview.number}` : 'Invoice'}
        fileName={preview ? `${preview.number}.pdf` : 'invoice.pdf'}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
