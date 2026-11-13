import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { DashboardOverviewDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { FilterSelect } from '@/components/app/DataTable';
import { reportFailure } from '@/components/app/OperationFeedback';
import { ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { formatLongDate, greetingFor } from '@/lib/format';
import { useBranchOptions } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { ActivityStream } from './components/ActivityStream';
import { InventoryHealth } from './components/InventoryHealth';
import { KpiCards } from './components/KpiCards';
import { RevenuePanel } from './components/RevenuePanel';
import { UpcomingPanel } from './components/UpcomingPanel';
import { CreateMenu } from './components/Toolbar';
import { RANGES, toInventory, toKpis, toMonthly } from './data/model';
import { downloadDashboardReport } from './exportReport';
import { useDashboardRange } from './rangeStore';

/** The charted dashboard, from real records, for all branches or the one an admin picks. */
export default function Dashboard() {
  const { me, can } = useAuth();
  const [range] = useDashboardRange();
  const [params, setParams] = useSearchParams();
  const branches = useBranchOptions();
  const branchId = params.get('branch') ?? undefined;
  const branchName = branches.data?.find((b) => b.id === branchId)?.name;
  // Fixed for the lifetime of the page so relative times and the date don't drift on re-render.
  const [now] = useState(() => Date.now());

  const query = useQuery({
    queryKey: [...qk.dashboard, 'overview', range, branchId ?? 'all'],
    queryFn: ({ signal }) => api.get<DashboardOverviewDto>('/dashboard/overview', { range, branchId }, signal),
  });
  const o = query.data;
  const kpis = useMemo(() => (o ? toKpis(o, range) : []), [o, range]);
  const monthly = useMemo(() => (o ? toMonthly(o) : []), [o]);
  const inventory = useMemo(() => (o ? toInventory(o) : []), [o]);

  const date = new Date(now);
  const firstName = me?.user.fullName.split(' ')[0];
  const periodLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? '';
  const scope = branchName ?? (me?.allBranches ? 'all branches' : 'your branch');

  function exportReport() {
    if (!o) return;
    void downloadDashboardReport(o, kpis, monthly, scope).catch(() =>
      reportFailure("We couldn't prepare that download. Try again in a moment."),
    );
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
            Your business overview for this {periodLabel} across {scope}: sales, payments, stock and what's coming up.
            {o && o.otherCurrencies.length > 0 && ` Amounts are in ${o.currency}; sales in ${o.otherCurrencies.join(', ')} are not included.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {me?.allBranches && (
            <FilterSelect
              label="Branch"
              allLabel="All branches"
              value={branchId}
              onChange={(v) => setParams(v ? { branch: v } : {}, { replace: true })}
              options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
          <Button variant="secondary" size="sm" onClick={exportReport} disabled={!o}>
            <Download aria-hidden /> Export report
          </Button>
          <CreateMenu />
        </div>
      </header>

      {query.isError ? (
        <Card>
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        </Card>
      ) : !o ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-3xl bg-surface p-5 shadow-raised">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-5 h-8 w-28" />
              <Skeleton className="mt-5 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <KpiCards kpis={kpis} currency={o.currency} />

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
            {o.monthly ? (
              <RevenuePanel
                range={range}
                data={monthly}
                priorYearK={o.priorYearRevenue === null ? null : Number(o.priorYearRevenue) / 1000}
                segments={o.segments ?? []}
                currency={o.currency}
              />
            ) : (
              <Card className="p-6 text-sm text-ink-muted">Revenue figures are shown to people who can see sales.</Card>
            )}
            <UpcomingPanel items={o.upcoming} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
            <InventoryHealth categories={inventory} canViewStock={can('inventory.read')} />
            <ActivityStream entries={o.activity} now={now} />
          </div>
        </>
      )}
    </>
  );
}
