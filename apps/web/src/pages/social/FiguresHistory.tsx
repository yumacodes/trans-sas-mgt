import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink } from 'lucide-react';
import {
  SOCIAL_FOLLOWER_LABELS,
  SOCIAL_PLATFORM_LABELS,
  type SocialAccountDto,
  type SocialAccountFiguresDto,
  type SocialPostDto,
  type SocialPostFiguresDto,
} from '@tsm/shared';
import { RecordModal } from '@/components/app/RecordModal';
import { EmptyState } from '@/components/app/States';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { compact, PLATFORM_COLORS } from './platform';

type Series = { key: string; label: string; color: string };

const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function GrowthChart<T extends { day: string }>({ rows, series, label }: { rows: T[]; series: Series[]; label: string }) {
  if (rows.length < 2) {
    return (
      <EmptyState
        title={rows.length === 1 ? 'One day recorded so far' : 'No figures yet'}
        description="The chart appears once there are figures for two or more days."
      />
    );
  }
  return (
    <div className="h-72" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
          <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => compact(v)} tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--color-ink-subtle)', fontSize: 12 }} />
          <Tooltip
            labelFormatter={(d: string) => formatDate(d)}
            formatter={(v: number, name: string) => [compact(v), series.find((s) => s.key === name)?.label ?? name]}
            contentStyle={{ borderRadius: 12, border: '1px solid var(--color-border)', fontSize: 13 }}
          />
          {series.length > 1 && <Legend formatter={(key: string) => series.find((s) => s.key === key)?.label ?? key} />}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FiguresTable<T extends { day: string; source: string; recordedBy: string | null }>({
  rows,
  columns,
}: {
  rows: T[];
  columns: { key: keyof T; label: string }[];
}) {
  if (!rows.length) return <EmptyState title="No figures recorded yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-ink-muted">
            <th className="py-2 pr-3 font-medium">Day</th>
            {columns.map((c) => (
              <th key={String(c.key)} className="py-2 pr-3 text-right font-medium">
                {c.label}
              </th>
            ))}
            <th className="py-2 font-medium">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.day} className="border-b border-border/60">
              <td className="py-2 pr-3">{formatDate(r.day)}</td>
              {columns.map((c) => (
                <td key={String(c.key)} className="py-2 pr-3 text-right tabular">
                  {compact(r[c.key] as number | null)}
                </td>
              ))}
              <td className="py-2 text-xs text-ink-muted">{r.source === 'automatic' ? 'Pulled' : (r.recordedBy ?? 'By hand')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountHistory({ account, onClose }: { account: SocialAccountDto | null; onClose: () => void }) {
  const figures = useQuery({
    queryKey: [...qk.socialAccounts, account?.id, 'figures'],
    queryFn: ({ signal }) => api.get<SocialAccountFiguresDto[]>(`/social/accounts/${account!.id}/figures`, undefined, signal),
    enabled: Boolean(account),
  });
  const rows = figures.data ?? [];
  const followers = account ? SOCIAL_FOLLOWER_LABELS[account.platform] : 'Followers';

  return (
    <RecordModal
      open={Boolean(account)}
      onOpenChange={(o) => !o && onClose()}
      title={account ? `@${account.handle}` : ''}
      subtitle={account ? `${SOCIAL_PLATFORM_LABELS[account.platform]}${account.displayName ? ` · ${account.displayName}` : ''}` : undefined}
      status={account && <Badge tone={account.syncMode === 'automatic' ? 'info' : 'neutral'}>{account.syncMode === 'automatic' ? 'Pulled daily' : 'Recorded by hand'}</Badge>}
      loading={figures.isLoading}
      error={figures.isError ? errorMessage(figures.error) : null}
      onRetry={() => void figures.refetch()}
      actions={
        account?.url && (
          <Button asChild variant="secondary">
            <a href={account.url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> Open profile
            </a>
          </Button>
        )
      }
      tabs={[
        {
          value: 'growth',
          label: 'Growth',
          content: account && (
            <GrowthChart
              rows={rows}
              label={`${followers} over time`}
              series={[{ key: 'followers', label: followers, color: PLATFORM_COLORS[account.platform] }]}
            />
          ),
        },
        {
          value: 'figures',
          label: 'Every day recorded',
          content: (
            <FiguresTable
              rows={rows}
              columns={[
                { key: 'followers', label: followers },
                { key: 'following', label: 'Following' },
                { key: 'postCount', label: 'Posts' },
                { key: 'totalViews', label: 'Views' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}

export function PostHistory({ post, onClose }: { post: SocialPostDto | null; onClose: () => void }) {
  const figures = useQuery({
    queryKey: [...qk.socialPosts, post?.id, 'figures'],
    queryFn: ({ signal }) => api.get<SocialPostFiguresDto[]>(`/social/posts/${post!.id}/figures`, undefined, signal),
    enabled: Boolean(post),
  });
  const rows = figures.data ?? [];
  const series: Series[] = [
    { key: 'likes', label: 'Likes', color: 'var(--color-chart-navy)' },
    { key: 'comments', label: 'Comments', color: 'var(--color-chart-teal)' },
    ...(rows.some((r) => r.views != null) ? [{ key: 'views', label: 'Views', color: '#c13584' }] : []),
  ];

  return (
    <RecordModal
      open={Boolean(post)}
      onOpenChange={(o) => !o && onClose()}
      title={post?.title ?? ''}
      subtitle={post ? `${SOCIAL_PLATFORM_LABELS[post.account.platform]} · @${post.account.handle}${post.publishedAt ? ` · ${formatDate(post.publishedAt)}` : ''}` : undefined}
      status={post && <Badge tone={post.pulled ? 'info' : 'neutral'}>{post.pulled ? 'Pulled daily' : 'Recorded by hand'}</Badge>}
      loading={figures.isLoading}
      error={figures.isError ? errorMessage(figures.error) : null}
      onRetry={() => void figures.refetch()}
      actions={
        post?.url && (
          <Button asChild variant="secondary">
            <a href={post.url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> Open post
            </a>
          </Button>
        )
      }
      tabs={[
        { value: 'growth', label: 'Growth', content: <GrowthChart rows={rows} label="Post figures over time" series={series} /> },
        {
          value: 'figures',
          label: 'Every day recorded',
          content: (
            <FiguresTable
              rows={rows}
              columns={[
                { key: 'views', label: 'Views' },
                { key: 'likes', label: 'Likes' },
                { key: 'comments', label: 'Comments' },
                { key: 'shares', label: 'Shares' },
                { key: 'saves', label: 'Saves' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
