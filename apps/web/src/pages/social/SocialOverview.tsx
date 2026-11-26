import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Heart, MessageCircle, Plus, Eye } from 'lucide-react';
import { SOCIAL_FOLLOWER_LABELS, SOCIAL_PLATFORM_LABELS, type SocialOverviewDto, type SocialPostDto } from '@tsm/shared';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { Change, compact, PlatformIcon, PLATFORM_COLORS } from './platform';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
] as const;

const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Total({ label, value, change, caption }: { label: string; value: number; change?: number; caption: string }) {
  return (
    <div className="animate-rise rounded-3xl border border-white/80 bg-surface p-4 shadow-raised">
      <p className="eyebrow">{label}</p>
      <p className="mt-2.5 flex items-baseline gap-2 text-3xl font-semibold leading-none tracking-tight tabular">
        {compact(value)}
        {change !== undefined && <Change value={change} className="text-sm font-medium" />}
      </p>
      <p className="mt-2.5 text-xs text-ink-subtle">{caption}</p>
    </div>
  );
}

function TopPost({ post, onOpen }: { post: SocialPostDto; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-surface-muted">
        {post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <PlatformIcon platform={post.account.platform} className="size-12 rounded-xl" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{post.title}</span>
          <span className="block text-xs text-ink-muted">
            @{post.account.handle}
            {post.publishedAt && ` · ${formatDate(post.publishedAt)}`}
          </span>
        </span>
        <span className="flex shrink-0 gap-3 text-xs text-ink-muted tabular">
          <span className="flex items-center gap-1" title="Likes">
            <Heart className="size-3.5" aria-hidden /> {compact(post.likes)}
          </span>
          <span className="hidden items-center gap-1 sm:flex" title="Comments">
            <MessageCircle className="size-3.5" aria-hidden /> {compact(post.comments)}
          </span>
          {post.views != null && (
            <span className="hidden items-center gap-1 sm:flex" title="Views">
              <Eye className="size-3.5" aria-hidden /> {compact(post.views)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function SocialOverview({
  onOpenPost,
  onAddAccount,
  canManage,
}: {
  onOpenPost: (post: SocialPostDto) => void;
  onAddAccount: () => void;
  canManage: boolean;
}) {
  const [days, setDays] = useState<number>(30);
  const overview = useQuery({
    queryKey: [...qk.socialOverview, days],
    queryFn: ({ signal }) => api.get<SocialOverviewDto>('/social/overview', { days }, signal),
  });

  if (overview.isError) return <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  const data = overview.data;

  if (data && data.accounts.length === 0) {
    return (
      <EmptyState
        title="No accounts tracked yet"
        description="Add the company's Instagram, Facebook Page, YouTube and TikTok accounts to start tracking their followers and posts."
        action={
          canManage && (
            <Button size="sm" onClick={onAddAccount}>
              <Plus aria-hidden /> Add account
            </Button>
          )
        }
      />
    );
  }

  const periodLabel = PERIODS.find((p) => p.days === days)?.label ?? `${days} days`;
  const accountsById = new Map((data?.accounts ?? []).map((a) => [a.id, a]));

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={days === p.days}
            onClick={() => setDays(p.days)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm transition-colors',
              days === p.days ? 'border-accent bg-accent text-accent-ink' : 'border-border bg-surface text-ink hover:border-border-strong',
            )}
          >
            Last {p.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
      ) : (
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Total label="Followers" value={data.totals.followers} change={data.totals.followersChange} caption={`All accounts, change over the last ${periodLabel}`} />
          <Total label="Posts published" value={data.totals.posts} caption={`Tracked posts published in the last ${periodLabel}`} />
          <Total label="Likes" value={data.totals.likes} caption="On posts published in this period" />
          <Total label="Views" value={data.totals.views} caption="On posts published in this period, where shown" />
        </section>
      )}

      {data && (
        <section aria-label="Accounts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.accounts.map((a) => (
            <div key={a.id} className="rounded-3xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={a.platform} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">@{a.handle}</p>
                  <p className="text-xs text-ink-muted">{SOCIAL_PLATFORM_LABELS[a.platform]}</p>
                </div>
              </div>
              <p className="mt-4 flex items-baseline gap-2 text-2xl font-semibold tabular">
                {compact(a.followers)}
                <Change value={a.followersChange} className="text-sm font-medium" />
              </p>
              <p className="text-xs text-ink-subtle">{SOCIAL_FOLLOWER_LABELS[a.platform]}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                <div>
                  <dt className="text-ink-subtle">Posts</dt>
                  <dd className="font-medium tabular">{a.postsInPeriod}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Likes</dt>
                  <dd className="font-medium tabular">{compact(a.likesInPeriod)}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Views</dt>
                  <dd className="font-medium tabular">{compact(a.viewsInPeriod)}</dd>
                </div>
              </dl>
              {a.lastSyncError && (
                <p className="mt-3 flex gap-1.5 rounded-xl bg-warning-soft p-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {a.lastSyncError}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {data && (
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Followers over time</h2>
            <p className="text-xs text-ink-muted">Each account&apos;s latest recorded figure on each day.</p>
            <div className="mt-4 h-72" role="img" aria-label="Line chart of followers per account">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.followerSeries.map((p) => ({ day: p.day, ...p.values }))} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                  <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(d: string) => formatDate(d)}
                    formatter={(v: number, id: string) => [compact(v), `@${accountsById.get(id)?.handle ?? ''}`]}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border)', fontSize: 13 }}
                  />
                  <Legend formatter={(id: string) => `@${accountsById.get(id)?.handle ?? ''}`} />
                  {data.accounts.map((a) => (
                    <Line key={a.id} type="monotone" dataKey={a.id} stroke={PLATFORM_COLORS[a.platform]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Most liked posts</h2>
            <p className="text-xs text-ink-muted">Published in the last {periodLabel}.</p>
            {data.topPosts.length ? (
              <ol className="mt-3 space-y-1">
                {data.topPosts.map((p) => (
                  <TopPost key={p.id} post={p} onOpen={() => onOpenPost(p)} />
                ))}
              </ol>
            ) : (
              <p className="mt-6 text-sm text-ink-muted">No tracked posts were published in this period.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
