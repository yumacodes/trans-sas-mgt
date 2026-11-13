import { Link } from 'react-router';
import type { DashboardOverviewDto } from '@tsm/shared';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/app/States';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type Item = DashboardOverviewDto['upcoming'][number];

const KIND: Record<Item['kind'], { label: string; style: string }> = {
  tender: { label: 'Tender', style: 'bg-highlight text-highlight-ink' },
  due: { label: 'Payment due', style: 'bg-warning-soft text-warning' },
  delivery: { label: 'Delivery', style: 'bg-info-soft text-info' },
};

/** Tender deadlines, payments falling due and expected deliveries over the next two weeks. */
export function UpcomingPanel({ items }: { items: Item[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Coming up</h2>
      <p className="mt-0.5 text-sm text-ink-muted">The next 14 days, and anything overdue</p>
      {items.length === 0 ? (
        <EmptyState title="Nothing due" description="Tender deadlines, payments due and expected deliveries will appear here." />
      ) : (
        <ul className="mt-4 flex-1 space-y-2.5">
          {items.map((e, i) => {
            const overdue = e.date < today;
            return (
              <li key={`${e.link}-${i}`}>
                <Link
                  to={e.link}
                  className={cn(
                    'block rounded-2xl border p-3.5 transition-colors',
                    i === 0 ? 'border-highlight bg-highlight-soft' : 'border-border bg-surface hover:bg-surface-muted',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <time dateTime={e.date} className={cn('text-xs font-semibold tabular', overdue ? 'text-danger' : 'text-ink-muted')}>
                      {overdue ? `Overdue · ${formatDate(e.date)}` : formatDate(e.date)}
                    </time>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', KIND[e.kind].style)}>{KIND[e.kind].label}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">{e.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{e.detail}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
