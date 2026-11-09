import { useEffect, useState } from 'react';
import { FileDown, Printer, Search } from 'lucide-react';
import { EXPENSE_KIND_LABELS, type ExpenseDto, type ExpenseKind } from '@tsm/shared';
import { ExpenseStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { useInvoicePdf } from './ExpenseDetailModal';

interface Props {
  kind: ExpenseKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick a record and print or download its invoice as an A4 PDF. */
export function ExpenseInvoiceDialog({ kind, open, onOpenChange }: Props) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const pdf = useInvoicePdf();

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const result = useListQuery<ExpenseDto>(
    [...qk.expenses, 'picker', kind],
    '/expenses',
    { kind, page: 1, pageSize: 10, sort: 'transactionDate:desc', q },
    open,
  );
  const rows = result.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
          <DialogDescription>
            Choose a {EXPENSE_KIND_LABELS[kind].toLowerCase()} record to print or download as an A4 PDF.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input
              autoFocus
              aria-label="Search records"
              placeholder="Search reference, category or counterparty"
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
            <EmptyState title="No records found" description={q ? 'Try a different search.' : 'Record one first.'} />
          ) : (
            <ul className="space-y-2">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.number}</span>
                      <ExpenseStatusBadge status={e.status} />
                    </div>
                    <p className="truncate text-xs text-ink-muted">
                      {e.counterparty ?? e.category} · {formatDate(e.transactionDate)} · {formatMoney(e.amount, e.currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" loading={pdf.isBusy('print', e.id)} onClick={() => void pdf.print(e)}>
                      <Printer aria-hidden /> Print
                    </Button>
                    <Button size="sm" variant="secondary" loading={pdf.isBusy('download', e.id)} onClick={() => void pdf.download(e)}>
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
