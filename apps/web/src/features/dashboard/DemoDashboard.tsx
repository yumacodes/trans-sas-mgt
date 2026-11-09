import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
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
} from './data/dashboardMockData';
import { downloadDashboardReport } from './exportReport';
import { useDashboardRange } from './rangeStore';

/**
 * Dashboard layout. Sales, payment and schedule figures have no backend yet, so they show
 * zeros and empty charts rather than invented numbers.
 */
export default function DemoDashboard() {
  const { me, can } = useAuth();
  const [range] = useDashboardRange();
  // Fixed for the lifetime of the page so relative times and the date don't drift on re-render.
  const [now] = useState(() => Date.now());

  const date = new Date(now);
  const firstName = me?.user.fullName.split(' ')[0];
  const kpis = useMemo(() => getKpis(range), [range]);
  const periodLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? '';
  const activities = useMemo(() => ACTIVITIES, []);

  function exportReport() {
    void downloadDashboardReport(range)
      .then(() =>
        toast.success('Report downloaded'),
      )
      .catch(() => toast.error("We couldn't prepare that download. Try again in a moment."));
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
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
