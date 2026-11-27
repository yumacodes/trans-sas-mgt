import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, FileDown, Printer, Sheet } from 'lucide-react';
import {
  REPORT_DESCRIPTIONS,
  REPORT_KEYS,
  REPORT_META,
  REPORT_STATUS_FILTERS,
  type ReportDto,
  type ReportKey,
} from '@tsm/shared';
import { DateRangeFilter } from '@/components/app/DateRangeFilter';
import { FilterSelect } from '@/components/app/DataTable';
import { reportFailure } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, downloadFile, errorMessage, printFile } from '@/lib/api';
import { downloadReportExcel } from '@/lib/exportExcel';
import { todayIso } from '@/lib/format';
import { useBranchOptions } from '@/lib/queries';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { REPORT_DATE_PRESETS, RIGHT, cellLink, parseSort, sheetValue, show, sortRows, type SortState } from './reportTable';

const yearStart = () => `${todayIso().slice(0, 4)}-01-01`;

export default function ReportPage() {
  const { key } = useParams();
  if (!key || !(REPORT_KEYS as readonly string[]).includes(key)) return <NotFoundPage />;
  // Keyed so switching reports starts with that report's own sort.
  return <Report key={key} reportKey={key as ReportKey} />;
}

function Report({ reportKey }: { reportKey: ReportKey }) {
  const meta = REPORT_META[reportKey];
  const statusFilter = REPORT_STATUS_FILTERS[reportKey];
  const branches = useBranchOptions();
  const [params, setParams] = useSearchParams();
  // Filters live in the URL so a report link is shareable and survives a reload. The older
  // from / to / branch names are still read so existing links keep working.
  const dateFrom = params.get('dateFrom') ?? params.get('from') ?? yearStart();
  const dateTo = params.get('dateTo') ?? params.get('to') ?? todayIso();
  const branchId = params.get('branchId') ?? params.get('branch') ?? undefined;
  const status = params.get('status') ?? undefined;
  const sort = parseSort(params.get('sort'));
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);

  const update = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const legacy of ['from', 'to', 'branch']) next.delete(legacy);
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setParams(next, { replace: true });
  };

  const query: Record<string, string> = {
    ...(meta.usesDates ? { dateFrom, dateTo } : {}),
    ...(branchId ? { branchId } : {}),
    ...(statusFilter && status ? { status } : {}),
  };
  const report = useQuery({
    queryKey: ['reports', reportKey, query],
    queryFn: ({ signal }) => api.get<ReportDto>(`/reports/${reportKey}`, query, signal),
  });
  const r = report.data;
  const qs = new URLSearchParams(query).toString();
  const rows = useMemo(() => (r ? sortRows(r.rows, r.columns, sort) : []), [r, sort]);
  const scope = { dateFrom: meta.usesDates ? dateFrom : undefined, dateTo: meta.usesDates ? dateTo : undefined, branchId };

  const toggleSort = (key: string) => {
    const next: SortState =
      sort?.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null;
    update({ sort: next ? `${next.key}:${next.dir}` : undefined });
  };

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
        [r.criteria.join(' · ')],
        [],
        cols.map((c) => c.label),
        ...rows.map((row) => cols.map((c) => sheetValue(c, row[c.key] ?? null))),
        ...r.totals.map((row) => cols.map((c) => sheetValue(c, row[c.key] ?? null))),
        [],
        ...r.notes.map((n) => [n]),
      ],
      { sheet: meta.title.slice(0, 31), boldRows: (_row, i) => i === 0 || i === 3 },
    ).catch(() => reportFailure("We couldn't prepare that download. Try again in a moment."));
  };

  return (
    <>
      <PageHeader
        title={meta.title}
        description={REPORT_DESCRIPTIONS[reportKey]}
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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {meta.usesDates && (
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            presets={REPORT_DATE_PRESETS}
            onChange={(from, to) => update({ dateFrom: from, dateTo: to })}
          />
        )}
        {(branches.data?.length ?? 0) > 1 && (
          <FilterSelect
            label="Branch"
            allLabel="All branches"
            value={branchId}
            onChange={(v) => update({ branchId: v })}
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        {statusFilter &&
          (statusFilter.allLabel ? (
            <FilterSelect
              label="Status"
              allLabel={statusFilter.allLabel}
              value={status}
              onChange={(v) => update({ status: v })}
              options={statusFilter.options}
            />
          ) : (
            <NativeSelect
              aria-label="Status"
              value={status ?? statusFilter.defaultValue ?? ''}
              onChange={(e) => update({ status: e.target.value === statusFilter.defaultValue ? undefined : e.target.value })}
              className="h-10 w-auto min-w-[160px] rounded-full border-transparent bg-surface-muted pl-4 shadow-none hover:bg-border/60"
            >
              {statusFilter.options.map((o) => (
                <option key={o.value} value={o.value}>
                  Status: {o.label}
                </option>
              ))}
            </NativeSelect>
          ))}
      </div>
      <p className="mb-3 min-h-4 text-xs text-ink-muted" aria-live="polite">
        {r ? r.criteria.join(' · ') : ''}
      </p>
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
          <EmptyState title="Nothing to report" description="No records match these criteria. Try a wider period, another branch or another status." />
        ) : r ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {r.title}. {r.criteria.join(', ')}. Select a column heading to sort.
              </caption>
              <thead>
                <tr className="border-b border-border/70">
                  {r.columns.map((c) => {
                    const active = sort?.key === c.key ? sort.dir : null;
                    const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
                        className={`px-2.5 py-2 xl:px-4 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-subtle ${RIGHT.has(c.format) ? 'text-right' : 'text-left'}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={`inline-flex items-center gap-1 rounded-md py-1 uppercase tracking-[0.09em] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent ${RIGHT.has(c.format) ? 'flex-row-reverse' : ''} ${active ? 'text-ink' : ''}`}
                        >
                          {c.label}
                          <Icon className={`size-3 shrink-0 ${active ? '' : 'opacity-40'}`} aria-hidden />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    {r.columns.map((c) => {
                      const text = show(c, row);
                      const href = text && c.link ? cellLink(c.link, row, scope) : null;
                      return (
                        <td key={c.key} className={`px-2.5 py-2.5 text-ink [overflow-wrap:anywhere] xl:px-4 ${RIGHT.has(c.format) ? 'text-right tabular' : ''}`}>
                          {href ? (
                            <Link to={href} className="font-medium text-accent underline-offset-2 hover:underline">
                              {text}
                            </Link>
                          ) : (
                            text
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {r.totals.length > 0 && (
                <tfoot>
                  {r.totals.map((row, i) => (
                    <tr key={i} className="border-t border-border bg-surface-muted/60 font-semibold">
                      {r.columns.map((c) => (
                        <td key={c.key} className={`px-2.5 py-2.5 text-ink [overflow-wrap:anywhere] xl:px-4 ${RIGHT.has(c.format) ? 'text-right tabular' : ''}`}>
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
      {r && r.notes.length > 0 && (
        <div className="mt-4 space-y-1 text-xs text-ink-muted">
          {r.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </>
  );
}
