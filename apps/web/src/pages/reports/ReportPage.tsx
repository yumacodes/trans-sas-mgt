import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Printer, Sheet } from 'lucide-react';
import { REPORT_KEYS, REPORT_META, type ReportCell, type ReportColumn, type ReportDto, type ReportKey } from '@tsm/shared';
import { FilterSelect } from '@/components/app/DataTable';
import { reportFailure } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, downloadFile, errorMessage, printFile } from '@/lib/api';
import { downloadReportExcel } from '@/lib/exportExcel';
import { formatDate, formatMoney, formatQuantity } from '@/lib/format';
import { useBranchOptions } from '@/lib/queries';
import { NotFoundPage } from '@/pages/NotFoundPage';

const RIGHT = new Set<ReportColumn['format']>(['money', 'quantity', 'count', 'percent']);

const yearStart = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);

function show(column: ReportColumn, row: Record<string, ReportCell>): string {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  switch (column.format) {
    case 'money': {
      const currency = column.currencyKey ? String(row[column.currencyKey] ?? '') : '';
      return currency && currency !== 'Cost' ? formatMoney(String(value), currency) : formatQuantity(String(value));
    }
    case 'quantity':
      return formatQuantity(String(value));
    case 'date':
      return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? formatDate(String(value)) : String(value);
    case 'percent':
      return `${value}%`;
    default:
      return String(value);
  }
}

/** Plain value for a spreadsheet cell, so amounts stay numeric. */
function sheetValue(column: ReportColumn, value: ReportCell) {
  if (value === null || value === undefined) return null;
  if (RIGHT.has(column.format)) return Number(value);
  return String(value);
}

export default function ReportPage() {
  const { key } = useParams();
  if (!key || !(REPORT_KEYS as readonly string[]).includes(key)) return <NotFoundPage />;
  return <Report reportKey={key as ReportKey} />;
}

function Report({ reportKey }: { reportKey: ReportKey }) {
  const meta = REPORT_META[reportKey];
  const branches = useBranchOptions();
  const [params, setParams] = useSearchParams();
  const dateFrom = params.get('from') ?? yearStart();
  const dateTo = params.get('to') ?? today();
  const branchId = params.get('branch') ?? undefined;
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);

  const set = (name: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const query = { ...(meta.usesDates ? { dateFrom, dateTo } : {}), ...(branchId ? { branchId } : {}) };
  const report = useQuery({
    queryKey: ['reports', reportKey, query],
    queryFn: ({ signal }) => api.get<ReportDto>(`/reports/${reportKey}`, query, signal),
  });
  const r = report.data;
  const qs = new URLSearchParams(query as Record<string, string>).toString();

  const pdf = async (mode: 'pdf' | 'print') => {
    setBusy(mode);
    try {
      if (mode === 'print') await printFile(`/reports/${reportKey}/pdf?${qs}`);
      else await downloadFile(`/reports/${reportKey}/pdf?${qs}`, `${reportKey}.pdf`);
    } catch (error) {
      reportFailure(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const excel = () => {
    if (!r) return;
    const cols = r.columns;
    void downloadReportExcel(
      `${reportKey}.xlsx`,
      [
        [r.title],
        ...r.criteria.map((c) => [c]),
        [],
        cols.map((c) => c.label),
        ...r.rows.map((row) => cols.map((c) => sheetValue(c, row[c.key] ?? null))),
        ...r.totals.map((row) => cols.map((c) => sheetValue(c, row[c.key] ?? null))),
        [],
        ...r.notes.map((n) => [n]),
      ],
      { sheet: meta.title.slice(0, 31), boldRows: (_row, i) => i === 0 || i === r.criteria.length + 2 },
    ).catch(() => reportFailure("We couldn't prepare that download. Try again in a moment."));
  };

  return (
    <>
      <PageHeader
        title={meta.title}
        description="A management report from the records in this system. Totals are per currency and are never mixed."
        actions={
          <>
            <Button variant="secondary" onClick={excel} disabled={!r}>
              <Sheet aria-hidden /> Excel
            </Button>
            <Button variant="secondary" onClick={() => void pdf('print')} loading={busy === 'print'} disabled={!r}>
              <Printer aria-hidden /> Print
            </Button>
            <Button onClick={() => void pdf('pdf')} loading={busy === 'pdf'} disabled={!r}>
              <FileDown aria-hidden /> PDF
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {meta.usesDates && (
          <>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              From
              <Input type="date" aria-label="From date" className="h-10 w-auto" value={dateFrom} max={dateTo} onChange={(e) => set('from', e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              To
              <Input type="date" aria-label="To date" className="h-10 w-auto" value={dateTo} min={dateFrom} onChange={(e) => set('to', e.target.value)} />
            </label>
          </>
        )}
        {(branches.data?.length ?? 0) > 1 && (
          <FilterSelect
            label="Branch"
            allLabel="All branches"
            value={branchId}
            onChange={(v) => set('branch', v)}
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
      </div>
      <Card className="overflow-hidden">
        {report.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : report.isError ? (
          <ErrorState message={errorMessage(report.error)} onRetry={() => void report.refetch()} />
        ) : r && r.rows.length === 0 ? (
          <EmptyState title="Nothing to report" description="No records match these criteria. Try a wider period or another branch." />
        ) : r ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">{r.title}</caption>
              <thead>
                <tr className="border-b border-border/70">
                  {r.columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.09em] text-ink-subtle ${RIGHT.has(c.format) ? 'text-right' : ''}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    {r.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 text-ink ${RIGHT.has(c.format) ? 'text-right tabular' : ''}`}>
                        {show(c, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {r.totals.length > 0 && (
                <tfoot>
                  {r.totals.map((row, i) => (
                    <tr key={i} className="border-t border-border bg-surface-muted/60 font-semibold">
                      {r.columns.map((c) => (
                        <td key={c.key} className={`px-4 py-2.5 text-ink ${RIGHT.has(c.format) ? 'text-right tabular' : ''}`}>
                          {show(c, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tfoot>
              )}
            </table>
          </div>
        ) : null}
      </Card>
      {r && (
        <div className="mt-4 space-y-1 text-xs text-ink-muted">
          <p>{r.criteria.join(' · ')}</p>
          {r.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </>
  );
}
