import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/app/States';
import { cn } from '@/lib/utils';
import type { DashboardOverviewDto } from '@tsm/shared';
import { getChartWindow, summariseRevenue, type MonthPoint, type RangeKey } from '../data/model';
import { formatPercent, formatSignedPercent, formatThousands } from '../format';

function ChartTooltip({ active, payload, currency }: TooltipProps<number, string> & { currency: string }) {
  const point = payload?.[0]?.payload as MonthPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-xs shadow-overlay">
      <p className="font-semibold text-ink">{point.full}</p>
      <dl className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-ink-muted">
            <span className="size-2 rounded-full bg-ink" aria-hidden /> Revenue
          </dt>
          <dd className="font-semibold tabular text-ink">
            {formatThousands(point.actual, currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-ink-muted">
            <span className="size-2 rounded-full bg-sage" aria-hidden /> Payments
          </dt>
          <dd className="font-semibold tabular text-ink">{formatThousands(point.payments, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-2.5 text-sm first:border-t-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular text-ink">{value}</dd>
    </div>
  );
}

interface Props {
  range: RangeKey;
  data: MonthPoint[];
  /** Revenue for the twelve months before, in thousands. */
  priorYearK: number | null;
  segments: NonNullable<DashboardOverviewDto['segments']>;
  currency: string;
}

export function RevenuePanel({ range, data, priorYearK, segments, currency }: Props) {
  const window_ = useMemo(() => getChartWindow(range, data), [range, data]);
  const summary = useMemo(() => summariseRevenue(range, data, priorYearK), [range, data, priorYearK]);
  const hasData = window_.points.some((p) => p.actual > 0 || p.payments > 0);
  const badge = summary.yoyPct !== null ? `${formatSignedPercent(summary.yoyPct)} YoY` : null;
  const SEGMENTS = segments.map((s) => {
    const revenue = Number(s.revenue) / 1000;
    const previous = Number(s.previous) / 1000;
    return { id: s.label, label: s.label, revenue, change: previous > 0 ? ((revenue - previous) / previous) * 100 : null };
  });
  const maxSegment = Math.max(1, ...SEGMENTS.map((s) => s.revenue));

  return (
    <Card className="flex min-w-0 flex-col p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Revenue and payments</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Confirmed sales excluding tax, and money received, over the last{' '}
            {range === 'month' ? '6 months' : '12 months'}
            {window_.grouped ? ', grouped by quarter' : ''}
          </p>
        </div>
        <ul className="flex items-center gap-4 text-xs text-ink-muted" aria-label="Chart legend">
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-5 rounded bg-ink" aria-hidden /> Revenue
          </li>
          <li className="flex items-center gap-2">
            <span
              className="h-0 w-5 border-t-2 border-dashed border-sage"
              aria-hidden
            />{' '}
            Payments
          </li>
        </ul>
      </div>

      <div className="mt-5 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">Revenue · {window_.span}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular text-ink">
            {formatThousands(summary.actualTotal, currency)}
          </p>
          {badge && (
            <span className="mt-2 inline-flex rounded-full bg-highlight px-2.5 py-0.5 text-xs font-semibold text-highlight-ink">
              {badge}
            </span>
          )}
          <dl className="mt-5">
            <SummaryRow label="Payments received" value={formatThousands(summary.paymentsTotal, currency)} />
            <SummaryRow
              label="Collected"
              value={summary.actualTotal > 0 ? `${Math.round((summary.paymentsTotal / summary.actualTotal) * 100)}%` : '—'}
            />
            <SummaryRow
              label="Best month"
              value={summary.best ? `${summary.best.label} · ${formatThousands(summary.best.value, currency)}` : '—'}
            />
          </dl>
        </div>

        <div className="h-64 min-h-64 min-w-0 lg:h-full" role="img" aria-label="Line chart of revenue and payments received">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={window_.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d9f75b" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#d9f75b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }}
                  dy={6}
                />
                <YAxis
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tickCount={4}
                  tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}M` : `${v}K`)}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: 'var(--color-border-strong)' }} />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="none"
                  fill="url(#rev-fill)"
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="payments"
                  stroke="var(--color-sage)"
                  strokeWidth={2.25}
                  strokeDasharray="6 5"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: 'var(--color-sage)', stroke: '#fff', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="var(--color-ink)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 5, fill: 'var(--color-ink)', stroke: '#fff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No revenue yet" description="Confirmed sales and payments will be plotted here." />
          )}
        </div>
      </div>

      {SEGMENTS.length > 0 && (
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Revenue by category, last 12 months">
        {SEGMENTS.map((s, i) => {
          const last = i === SEGMENTS.length - 1;
          return (
            <li
              key={s.id}
              className={cn(
                'rounded-2xl p-4',
                last ? 'bg-dark text-white' : i === 0 ? 'bg-highlight-soft text-ink' : 'bg-surface-muted text-ink',
              )}
            >
              <p className={cn('flex items-center gap-2 text-xs', last ? 'text-dark-ink/80' : 'text-ink-muted')}>
                <span
                  className={cn('size-2 rounded-full', last ? 'bg-highlight' : i === 0 ? 'bg-deep-green' : 'bg-chart-navy')}
                  aria-hidden
                />
                {s.label}
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="text-xl font-semibold tabular">{formatThousands(s.revenue, currency)}</p>
                <p
                  className={cn(
                    'text-xs font-semibold tabular',
                    last ? 'text-highlight' : (s.change ?? 0) < 0 ? 'text-danger' : 'text-deep-green',
                  )}
                >
                  {s.change === null ? 'New' : formatSignedPercent(s.change, 0)}
                </p>
              </div>
              <div
                className={cn('mt-3 h-1 rounded-full', last ? 'bg-white/15' : 'bg-black/[0.07]')}
                role="presentation"
              >
                <div
                  className={cn('h-full rounded-full', last ? 'bg-highlight' : 'bg-ink')}
                  style={{ width: `${(s.revenue / maxSegment) * 100}%` }}
                />
              </div>
              <span className="sr-only">{s.change === null ? 'no earlier sales' : `${formatPercent(s.change, 0)} change`}</span>
            </li>
          );
        })}
      </ul>
      )}
    </Card>
  );
}
