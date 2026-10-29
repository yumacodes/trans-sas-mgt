import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Download, FlaskConical, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkBar } from '@/components/app/DataTable';
import { EmptyState } from '@/components/app/States';
import { useRouteTitle } from '@/layout/Topbar';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadReportExcel } from '@/lib/exportExcel';
import { formatCompactMoney } from '@/features/dashboard/format';
import type { Col, Line, PageConfig, Row } from './sampleData';

const PAGE_SIZE = 10;
const CURRENCY = 'GHS';

const TONES: Record<string, BadgeProps['tone']> = {
  Draft: 'neutral', Preparing: 'neutral', Created: 'neutral', Adjustment: 'neutral',
  Issued: 'info', Sent: 'info', Submitted: 'info', Ordered: 'info', Dispatched: 'info', Transfer: 'info',
  Pending: 'warning', 'Pending approval': 'warning', 'Partially paid': 'warning', 'Partially received': 'warning',
  Accepted: 'success', Paid: 'success', Delivered: 'success', Signed: 'success', Confirmed: 'success', Approved: 'success',
  Received: 'success', Awarded: 'success', Receipt: 'success',
  Rejected: 'danger', Lost: 'danger', Cancelled: 'danger', Reversed: 'danger', Expired: 'neutral', Issue: 'warning',
};

function StatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={TONES[value] ?? 'neutral'} dot>
      {value}
    </Badge>
  );
}

function render(col: Col, row: Row) {
  const v = row[col.key];
  if (v === undefined || v === '' || Array.isArray(v)) return '—';
  switch (col.kind) {
    case 'money':
      return formatMoney(Number(v), CURRENCY);
    case 'date':
      return formatDate(String(v));
    case 'number':
      return Number(v).toLocaleString();
    case 'percent':
      return `${Number(v).toFixed(1)}%`;
    case 'status':
      return <StatusBadge value={String(v)} />;
    case 'ref':
      return <span className="font-mono text-xs font-medium text-ink">{String(v)}</span>;
    default:
      return String(v);
  }
}

const rightAligned = (c: Col) => c.kind === 'money' || c.kind === 'number' || c.kind === 'percent';

function plain(col: Col, row: Row): string | number {
  const v = row[col.key];
  return v === undefined || Array.isArray(v) ? '' : v;
}

export default function SamplePage({ config }: { config: PageConfig }) {
  const handle = useRouteTitle();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const statuses = useMemo(
    () => (config.statusKey ? [...new Set(config.rows.map((r) => String(r[config.statusKey!])))] : []),
    [config],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return config.rows.filter((r) => {
      if (status !== 'all' && config.statusKey && String(r[config.statusKey]) !== status) return false;
      return !q || config.cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q));
    });
  }, [config, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const selectedRows = visible.filter((r) => selected.has(r.id));
  const allSelected = visible.length > 0 && selectedRows.length === visible.length;
  const toggleRow = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)));

  /** Sample rows as an Excel workbook, headed by a line saying they are not real. */
  function exportRows(rows: Row[], filename: string) {
    return downloadReportExcel(
      filename,
      [
        ['Sample data - not real business records'],
        [],
        config.cols.map((c) => c.label),
        ...rows.map((r) => config.cols.map((c) => plain(c, r))),
      ],
      { sheet: 'Sample', boldRows: (_row, index) => index === 0 || index === 2 },
    ).then(
      () => true,
      () => {
        toast.error("We couldn't prepare that download. Try again in a moment.");
        return false;
      },
    );
  }

  function exportSelected() {
    void exportRows(selectedRows, `${config.exportName}-selected.xlsx`).then((ok) => {
      if (!ok) return;
      toast.success(`Exported ${selectedRows.length} sample row${selectedRows.length === 1 ? '' : 's'}`);
      setSelected(new Set());
    });
  }

  function exportVisible() {
    void exportRows(filtered, `${config.exportName}.xlsx`).then((ok) => {
      if (!ok) return;
      toast.success('Sample rows downloaded', {
        description: 'The file contains the rows currently shown, which are sample data.',
      });
    });
  }

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow">{handle?.section ?? 'Workspace'}</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink">{handle?.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{config.description}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
            <FlaskConical className="size-3.5" aria-hidden /> Sample data. This module is not built yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportVisible} disabled={filtered.length === 0}>
            <Download aria-hidden /> Export
          </Button>
          {config.newLabel && (
            <Button variant="dark" size="sm" disabled title="This workflow is not built yet">
              <Plus aria-hidden /> {config.newLabel}
            </Button>
          )}
        </div>
      </header>

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {config.kpis.map((k, i) => (
          <div
            key={k.label}
            style={{ animationDelay: `${i * 50}ms` }}
            className="animate-rise rounded-3xl border border-white/80 bg-surface p-5 shadow-raised"
          >
            <p className="eyebrow">{k.label}</p>
            <p className="mt-3 truncate text-[1.75rem] font-semibold leading-none tracking-tight tabular text-ink">
              {k.value(config.rows)}
            </p>
            <p className="mt-3 text-xs text-ink-subtle">{k.caption(config.rows)}</p>
          </div>
        ))}
      </section>

      {config.chart && <ChartCard chart={config.chart} rows={config.rows} />}

      {config.note && (
        <p className="mt-5 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-ink">{config.note}</p>
      )}

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-2 px-4 pb-1 pt-4 lg:flex-row lg:items-center">
          <div className="group relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle transition-colors group-focus-within:text-accent" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); setSelected(new Set()); }}
              placeholder="Search this table"
              aria-label="Search this table"
              className="h-10 w-full rounded-full bg-surface-muted pl-10 pr-4 text-sm text-ink outline-none transition-[background-color,box-shadow] duration-200 placeholder:text-ink-subtle focus:bg-surface focus:shadow-[0_0_0_2px_var(--color-accent)]"
            />
          </div>
          {statuses.length > 1 && (
            <div role="radiogroup" aria-label="Filter by status" className="inline-flex flex-wrap gap-1 rounded-full bg-surface-muted p-1">
              {['all', ...statuses].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => { setStatus(s); setPage(1); setSelected(new Set()); }}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    status === s ? 'bg-dark text-white shadow-card' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">{handle?.title} (sample data)</caption>
            <thead>
              <tr className="border-b border-border/70">
                <th scope="col" className="w-12 py-3 pl-4 pr-0">
                  <Checkbox
                    checked={allSelected ? true : selectedRows.length > 0 ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all rows on this page"
                  />
                </th>
                {config.cols.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.09em] text-ink-subtle',
                      rightAligned(c) && 'text-right',
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, n) => (
                <tr
                  key={row.id}
                  style={{ animationDelay: `${Math.min(n, 12) * 22}ms` }}
                  data-selected={selected.has(row.id) || undefined}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a,button,input')) return;
                    if (window.getSelection()?.toString()) return;
                    setOpen(row);
                  }}
                  className="animate-rise cursor-pointer border-b border-border/40 transition-colors duration-200 last:border-0 hover:bg-surface-muted/60 data-[selected]:bg-surface-muted/80"
                >
                  <td className="w-12 py-0 pl-4 pr-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleRow(row.id)}
                      aria-label="Select row"
                    />
                  </td>
                  {config.cols.map((c, i) => (
                    <td key={c.key} className={cn('px-4 py-3.5 text-ink', rightAligned(c) && 'text-right tabular')}>
                      {i === 0 ? (
                        <button
                          type="button"
                          onClick={() => setOpen(row)}
                          className="rounded text-left font-medium text-accent hover:underline"
                        >
                          {render(c, row)}
                        </button>
                      ) : (
                        render(c, row)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState title="Nothing matches" description="Try a different search or status." />}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs text-ink-muted">
          <span>
            Showing <span className="font-medium text-ink">{filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1}</span>–
            <span className="font-medium text-ink">{Math.min(current * PAGE_SIZE, filtered.length)}</span> of{' '}
            <span className="font-medium text-ink">{filtered.length}</span>
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" disabled={current <= 1} onClick={() => { setPage(current - 1); setSelected(new Set()); }} aria-label="Previous page">
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={current >= pages} onClick={() => { setPage(current + 1); setSelected(new Set()); }} aria-label="Next page">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      </Card>

      {selectedRows.length > 0 && (
        <BulkBar count={selectedRows.length} onDiscard={() => setSelected(new Set())}>
          <button
            type="button"
            onClick={exportSelected}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-4"
          >
            <Download aria-hidden /> Export
          </button>
        </BulkBar>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="lg">
          {open && <Detail config={config} row={open} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ config, row }: { config: PageConfig; row: Row }) {
  const lines = row.lines as Line[] | undefined;
  const priced = lines?.some((l) => l.price > 0);
  const total = lines?.reduce((s, l) => s + l.qty * l.price, 0) ?? 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{config.detailTitle(row)}</DialogTitle>
        <DialogDescription>Sample record. It is not stored anywhere.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-5 pb-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {config.cols.map((c) => (
            <div key={c.key}>
              <dt className="eyebrow">{c.label}</dt>
              <dd className="mt-0.5 text-sm text-ink">{render(c, row)}</dd>
            </div>
          ))}
        </dl>
        {lines && lines.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted text-[11px] uppercase tracking-[0.09em] text-ink-subtle">
                  <th className="px-3 py-2 text-left font-semibold">Item</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  {priced && <th className="px-3 py-2 text-right font-semibold">Unit price</th>}
                  {priced && <th className="px-3 py-2 text-right font-semibold">Amount</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2">{l.item}</td>
                    <td className="px-3 py-2 text-right tabular">{l.qty}</td>
                    {priced && <td className="px-3 py-2 text-right tabular">{formatMoney(l.price, CURRENCY)}</td>}
                    {priced && <td className="px-3 py-2 text-right tabular">{formatMoney(l.qty * l.price, CURRENCY)}</td>}
                  </tr>
                ))}
              </tbody>
              {priced && (
                <tfoot>
                  <tr className="border-t border-border bg-surface-muted font-semibold">
                    <td className="px-3 py-2" colSpan={3}>Total</td>
                    <td className="px-3 py-2 text-right tabular">{formatMoney(total, CURRENCY)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </DialogBody>
    </>
  );
}

function ChartCard({ chart, rows }: { chart: NonNullable<PageConfig['chart']>; rows: Row[] }) {
  return (
    <Card className="mt-5 p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{chart.title}</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Sample figures</p>
      <div className="mt-4 h-64" role="img" aria-label={chart.title}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis dataKey={chart.labelKey} tickLine={false} axisLine={false} interval={0} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }} dy={6}
              tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
            <YAxis width={56} tickLine={false} axisLine={false} tickCount={4} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 11 }}
              tickFormatter={(v: number) => (chart.money ? formatCompactMoney(v).replace('GH₵ ', '') : String(v))} />
            <Tooltip
              cursor={{ fill: 'rgb(20 20 58 / 0.04)' }}
              formatter={(v: number) => [chart.money ? formatMoney(v, CURRENCY) : v, '']}
              labelStyle={{ fontWeight: 600 }}
              separator=""
              contentStyle={{ borderRadius: 16, border: '1px solid var(--color-border)', fontSize: 12 }}
            />
            <Bar dataKey={chart.valueKey} fill="var(--color-dark)" radius={[8, 8, 0, 0]} maxBarSize={44} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
