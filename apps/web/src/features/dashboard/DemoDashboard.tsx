import { useMemo, useState } from 'react';
import { Download, FlaskConical, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { formatLongDate, greetingFor } from '@/lib/format';
import { ActivityStream } from './components/ActivityStream';
import { InventoryHealth } from './components/InventoryHealth';
import { KpiCards } from './components/KpiCards';
import { RevenuePanel } from './components/RevenuePanel';
import { SchedulePanel } from './components/SchedulePanel';
import { CreateMenu } from './components/Toolbar';
import {
  ACTIVITIES,
  RANGES,
  getKpis,
  type ActivityItem,
} from './data/dashboardMockData';
import { downloadDashboardCsv } from './exportCsv';
import { useDashboardRange } from './rangeStore';

/**
 * Dashboard populated entirely from `data/dashboardMockData.ts`. Every interaction here is
 * local to the page: nothing is sent to the server or saved.
 */
export default function DemoDashboard() {
  const { me, can } = useAuth();
  const [range] = useDashboardRange();
  const [extra, setExtra] = useState<ActivityItem[]>([]);
  const [logging, setLogging] = useState(false);
  // Fixed for the lifetime of the page so relative times and the date don't drift on re-render.
  const [now] = useState(() => Date.now());

  const date = new Date(now);
  const firstName = me?.user.fullName.split(' ')[0];
  const kpis = useMemo(() => getKpis(range), [range]);
  const periodLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? '';
  const activities = useMemo(() => [...extra, ...ACTIVITIES], [extra]);

  function logActivity() {
    setLogging(true);
    window.setTimeout(() => {
      setExtra((cur) => [
        {
          id: `demo-${cur.length + 1}`,
          icon: 'demo',
          tone: 'green',
          text: `Sample activity logged from the dashboard (${cur.length + 1})`,
          category: 'Sample',
          minutesAgo: 0,
          reference: `DEMO-${String(cur.length + 1).padStart(3, '0')}`,
          related: 'Not linked to any record',
          by: me?.user.fullName ?? 'You',
        },
        ...cur,
      ]);
      setLogging(false);
      toast.success('Sample entry added', {
        description: 'It exists only on this page and is gone when you reload.',
      });
    }, 600);
  }

  function exportReport() {
    downloadDashboardCsv(range);
    toast.success('Sample figures downloaded', {
      description: 'This file holds the sample dashboard figures, not an official report.',
    });
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow">{formatLongDate(date)}</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {greetingFor(date.getHours())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">
            Here is your business overview for this {periodLabel === 'month' ? 'month' : periodLabel},
            including sales, stock, and outstanding payments.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
            <FlaskConical className="size-3.5" aria-hidden /> Sample data — figures are illustrative
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="dark" size="sm" onClick={logActivity} disabled={logging}>
            {logging ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Log activity
          </Button>
          <Button variant="secondary" size="sm" onClick={exportReport}>
            <Download aria-hidden /> Export report
          </Button>
          <CreateMenu />
        </div>
      </header>

      <KpiCards kpis={kpis} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <RevenuePanel range={range} />
        <SchedulePanel />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <InventoryHealth canViewStock={can('inventory.read')} />
        <ActivityStream items={activities} now={now} />
      </div>
    </>
  );
}
