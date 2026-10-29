import { Link } from 'react-router';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KpiDef } from '../data/dashboardMockData';
import { formatCompactMoney, formatPercent, formatSignedPercent } from '../format';

function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="pointer-events-none h-12 w-28 shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#spark-${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Change({ kpi }: { kpi: KpiDef }) {
  if (kpi.change === null) return null;
  const good = kpi.change === 0 ? null : kpi.change > 0 === kpi.upIsGood;
  const Icon = kpi.change === 0 ? Minus : kpi.change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular',
        good === null && 'bg-surface-muted text-ink-muted',
        good === true && 'bg-highlight-soft text-deep-green',
        good === false && 'bg-danger-soft text-danger',
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatSignedPercent(kpi.change)}
      <span className="sr-only">{good ? ', favourable' : good === false ? ', unfavourable' : ''}</span>
    </span>
  );
}

function KpiCard({ kpi, index }: { kpi: KpiDef; index: number }) {
  const value = kpi.unit === 'money' ? formatCompactMoney(kpi.value) : formatPercent(kpi.value);
  const body = (
    <>
      <p className="eyebrow">{kpi.label}</p>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular text-ink">
          {value}
        </p>
        <Change kpi={kpi} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="min-w-0 text-xs text-ink-subtle">{kpi.caption}</p>
        <Sparkline values={kpi.trend} color={kpi.tone} id={kpi.id} />
      </div>
    </>
  );
  const cls =
    'block animate-rise rounded-3xl border border-white/80 bg-surface p-5 shadow-raised transition-[transform,box-shadow] duration-200';
  const style = { animationDelay: `${index * 50}ms` };
  return kpi.to ? (
    <Link to={kpi.to} style={style} className={cn(cls, 'hover:-translate-y-0.5 hover:shadow-overlay')}>
      {body}
    </Link>
  ) : (
    <div style={style} className={cls}>
      {body}
    </div>
  );
}

export function KpiCards({ kpis }: { kpis: KpiDef[] }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k, i) => (
        <KpiCard key={k.id} kpi={k} index={i} />
      ))}
    </section>
  );
}
