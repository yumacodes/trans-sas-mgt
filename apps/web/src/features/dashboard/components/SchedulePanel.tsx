import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SCHEDULE, scheduleTotals, type ScheduleEvent } from '../data/dashboardMockData';
import { formatMinutes } from '../format';

const KIND_STYLE: Record<ScheduleEvent['kind'], string> = {
  Internal: 'bg-surface-muted text-ink-muted',
  'Client Call': 'bg-highlight text-highlight-ink',
  Operations: 'bg-info-soft text-info',
  Finance: 'bg-warning-soft text-warning',
};

export function SchedulePanel() {
  const [open, setOpen] = useState<ScheduleEvent | null>(null);
  const totals = scheduleTotals();

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Today’s schedule</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">Sample entries, not a connected calendar</p>
        </div>
        <button
          type="button"
          onClick={() =>
            toast.info('No calendar is connected yet', {
              description: 'Scheduling will be available once a calendar module is added.',
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink hover:bg-accent-soft hover:text-accent"
        >
          <CalendarDays className="size-3.5" aria-hidden /> Calendar
        </button>
      </div>

      <ul className="mt-4 flex-1 space-y-2.5">
        {SCHEDULE.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setOpen(e)}
              className={cn(
                'w-full rounded-2xl border p-3.5 text-left transition-colors',
                e.featured
                  ? 'border-highlight bg-highlight-soft'
                  : 'border-border bg-surface hover:bg-surface-muted',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <time className="text-xs font-semibold tabular text-ink-muted">
                  {e.start} – {e.end}
                </time>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', KIND_STYLE[e.kind])}>
                  {e.kind}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">{e.title}</p>
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                <span className="flex size-6 items-center justify-center rounded-full bg-dark text-[10px] font-semibold text-white">
                  {e.initials}
                </span>
                {e.who}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="eyebrow">Scheduled</dt>
          <dd className="mt-1 font-semibold tabular text-ink">{formatMinutes(totals.bookedMinutes)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Focus time</dt>
          <dd className="mt-1 font-semibold tabular text-ink">{Math.round(totals.freePct)}% free</dd>
        </div>
      </dl>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="sm">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.title}</DialogTitle>
                <DialogDescription>
                  {open.start} – {open.end} · {open.kind}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-3 pb-5 text-sm">
                <p className="text-ink-muted">{open.note}</p>
                <p className="text-ink">
                  <span className="eyebrow mr-2">With</span>
                  {open.who}
                </p>
                <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-subtle">
                  Sample event. It is not stored anywhere.
                </p>
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
