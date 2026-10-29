import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ClipboardList,
  FileClock,
  Package,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { AuditEntryDto, DashboardSummaryDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { formatCount, formatLongDate, formatRelative, greetingFor } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

type MetricKey = keyof Omit<DashboardSummaryDto, 'recentActivity'>;

interface MetricDef {
  key: MetricKey;
  label: string;
  /** Exact definition shown to users so figures are not misread. */
  definition: string;
  icon: ReactNode;
  to: string;
  /** Rendered as a dark attention card while the figure is above zero. */
  attention?: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: 'activeClients',
    label: 'Active clients',
    definition: 'Clients that are not archived',
    icon: <Users className="size-4" aria-hidden />,
    to: '/clients?status=active',
  },
  {
    key: 'registeredClients',
    label: 'Registered clients',
    definition: 'Clients holding an active registration',
    icon: <UserCheck className="size-4" aria-hidden />,
    to: '/registered-clients?status=active',
  },
  {
    key: 'activeStockItems',
    label: 'Stock items',
    definition: 'Catalogue items marked active',
    icon: <Package className="size-4" aria-hidden />,
    to: '/stock-items?isActive=true',
  },
  {
    key: 'lowStockItems',
    label: 'Low stock',
    definition: 'Active items at or below their reorder level',
    icon: <AlertTriangle className="size-4" aria-hidden />,
    to: '/stock-items?lowStock=true',
    attention: true,
  },
  {
    key: 'activeBranches',
    label: 'Branches',
    definition: 'Branches currently in operation',
    icon: <Building2 className="size-4" aria-hidden />,
    to: '/admin/branches?isActive=true',
  },
];

const ENTITY_STYLE: Record<string, { label: string; icon: ReactNode; tile: string }> = {
  client: { label: 'Client', icon: <Users className="size-4" />, tile: 'bg-accent-soft text-accent' },
  client_registration: {
    label: 'Registration',
    icon: <UserCheck className="size-4" />,
    tile: 'bg-highlight-soft text-highlight-ink',
  },
  stock_item: { label: 'Stock', icon: <Package className="size-4" />, tile: 'bg-info-soft text-info' },
  stock_category: { label: 'Stock', icon: <Package className="size-4" />, tile: 'bg-info-soft text-info' },
  branch: { label: 'Branch', icon: <Building2 className="size-4" />, tile: 'bg-warning-soft text-warning' },
  user: { label: 'User', icon: <UserCog className="size-4" />, tile: 'bg-surface-muted text-ink-muted' },
  role: { label: 'Access', icon: <ShieldCheck className="size-4" />, tile: 'bg-surface-muted text-ink-muted' },
  company: { label: 'Company', icon: <Building2 className="size-4" />, tile: 'bg-warning-soft text-warning' },
};

const FALLBACK_STYLE = {
  label: 'Update',
  icon: <ClipboardList className="size-4" />,
  tile: 'bg-surface-muted text-ink-muted',
};

export default function LiveDashboard() {
  const { me } = useAuth();
  const query = useQuery({
    queryKey: qk.dashboard,
    queryFn: ({ signal }) => api.get<DashboardSummaryDto>('/dashboard/summary', undefined, signal),
  });

  const now = new Date();
  const firstName = me?.user.fullName.split(' ')[0];
  const visible = METRICS.filter(
    (m) => query.data?.[m.key] !== null && query.data?.[m.key] !== undefined,
  );

  return (
    <>
      <header className="mb-6">
        <p className="eyebrow">{formatLongDate(now)}</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {greetingFor(now.getHours())}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Current figures from the business records you have access to.
        </p>
      </header>

      {query.isError ? (
        <Card>
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <>
          <section
            aria-label="Key figures"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
          >
            {query.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-3xl bg-surface p-5 shadow-raised">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-5 h-9 w-16" />
                    <Skeleton className="mt-5 h-3 w-32" />
                  </div>
                ))
              : visible.map((m, i) => (
                  <MetricCard
                    key={m.key}
                    metric={m}
                    value={query.data![m.key] as number}
                    index={i}
                  />
                ))}
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            {query.data?.recentActivity ? (
              <ActivityStream entries={query.data.recentActivity} />
            ) : (
              <Card className="p-8">
                <EmptyState
                  title="Nothing to show here yet"
                  description="Activity from the modules you can access will appear on this page."
                />
              </Card>
            )}

            {!query.isLoading && (
              <aside
                aria-label="What is coming"
                className="self-start rounded-3xl bg-highlight-soft p-6 text-highlight-ink"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-highlight">
                  <FileClock className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-base font-semibold">Sales and finance figures</h2>
                <p className="mt-1.5 text-sm leading-relaxed opacity-80">
                  Sales, payments, expenses and tender totals will appear here once those modules
                  are in use. Nothing is shown until there are real records to calculate it from.
                </p>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  );
}

function MetricCard({ metric, value, index }: { metric: MetricDef; value: number; index: number }) {
  const dark = Boolean(metric.attention) && value > 0;
  return (
    <Link
      to={metric.to}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        'group relative flex min-h-40 animate-rise flex-col justify-between rounded-3xl p-5 shadow-raised transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-overlay',
        dark ? 'bg-dark text-white' : 'border border-white/80 bg-surface text-ink',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('eyebrow', dark && 'text-dark-ink/70')}>{metric.label}</span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-full transition-transform duration-200 group-hover:rotate-12',
            dark ? 'bg-highlight text-highlight-ink' : 'bg-accent-soft text-accent',
          )}
        >
          {metric.icon}
        </span>
      </div>
      <div>
        <p className="text-4xl font-semibold tabular tracking-tight">{formatCount(value)}</p>
        <p
          className={cn(
            'mt-2 flex min-h-8 items-start gap-1 text-xs',
            dark ? 'text-dark-ink/70' : 'text-ink-subtle',
          )}
        >
          <span className="min-w-0 flex-1">{metric.definition}</span>
          <ArrowUpRight
            className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </p>
      </div>
    </Link>
  );
}

function ActivityStream({ entries }: { entries: AuditEntryDto[] }) {
  return (
    <Card>
      <CardHeader className="border-b-0 pb-2">
        <div>
          <CardTitle>Activity stream</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">The latest changes recorded in the system</p>
        </div>
        <Link
          to="/admin/audit-log"
          className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink hover:bg-accent-soft hover:text-accent"
        >
          Audit log <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </CardHeader>
      {entries.length === 0 ? (
        <EmptyState
          title="No activity recorded yet"
          description="Changes to clients, stock items and settings will appear here."
        />
      ) : (
        <ul className="px-3 pb-3">
          {entries.map((e) => {
            const style = ENTITY_STYLE[e.entityType] ?? FALLBACK_STYLE;
            return (
              <li
                key={e.id}
                className="flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-surface-muted"
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-2xl',
                    style.tile,
                  )}
                  aria-hidden
                >
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{e.summary}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
                    <span className="rounded-full bg-surface-muted px-2 py-px font-semibold text-ink-muted">
                      {style.label}
                    </span>
                    <span>{e.actor?.fullName ?? 'System'}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={e.createdAt}>{formatRelative(e.createdAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
