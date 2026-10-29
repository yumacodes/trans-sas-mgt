import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { request, type QueryValue } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Total number of records matching a filter, read from the list endpoint's paging metadata. */
export function useTotal(key: readonly unknown[], path: string, filters: Record<string, QueryValue> = {}) {
  return useQuery({
    queryKey: [...key, 'total', filters],
    queryFn: async ({ signal }) => {
      const res = await request<unknown[]>('GET', path, { query: { ...filters, page: 1, pageSize: 1 }, signal });
      return res.meta?.total ?? 0;
    },
    staleTime: 30_000,
  });
}

export interface Stat {
  label: string;
  /** Result of `useTotal`, or any number. Undefined while loading. */
  value: number | undefined;
  caption: string;
  /** Highlights the card (near-black) while the value is above zero. */
  attention?: boolean;
  /** Applies a filter when the card is clicked. */
  onSelect?: () => void;
  active?: boolean;
}

/** Summary cards shown above a list, in the same style as the dashboard's key figures. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <section aria-label="Summary" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((s, i) => {
        const dark = Boolean(s.attention) && (s.value ?? 0) > 0;
        const body = (
          <>
            <p className={cn('eyebrow', dark && 'text-dark-ink/70')}>{s.label}</p>
            {s.value === undefined ? (
              <Skeleton className="mt-3 h-8 w-14" />
            ) : (
              <p className="mt-2.5 text-3xl font-semibold leading-none tracking-tight tabular">
                {formatCount(s.value)}
              </p>
            )}
            <p className={cn('mt-2.5 text-xs', dark ? 'text-dark-ink/70' : 'text-ink-subtle')}>{s.caption}</p>
          </>
        );
        const cls = cn(
          'animate-rise rounded-3xl p-4 text-left shadow-raised transition-[transform,box-shadow] duration-200',
          dark ? 'bg-dark text-white' : 'border border-white/80 bg-surface text-ink',
          s.active && !dark && 'ring-2 ring-accent/40',
        );
        const style = { animationDelay: `${i * 40}ms` };
        return s.onSelect ? (
          <button key={s.label} type="button" onClick={s.onSelect} aria-pressed={s.active} style={style} className={cn(cls, 'hover:-translate-y-0.5 hover:shadow-overlay')}>
            {body}
          </button>
        ) : (
          <div key={s.label} style={style} className={cls}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

/** Rounded tile with initials, used as the leading mark of a record's primary cell. */
export function EntityTile({ text, tone = 'accent' }: { text: string; tone?: 'accent' | 'highlight' | 'info' | 'neutral' }) {
  const letters = text
    .replace(/\[[^\]]*\]\s*/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'highlight' && 'bg-highlight-soft text-highlight-ink',
        tone === 'info' && 'bg-info-soft text-info',
        tone === 'neutral' && 'bg-surface-muted text-ink-muted',
      )}
    >
      {letters || '·'}
    </span>
  );
}
