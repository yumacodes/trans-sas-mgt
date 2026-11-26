import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, ArchiveRestore, ExternalLink, History, Info, PenLine, Pencil, Plus, RefreshCw } from 'lucide-react';
import {
  SOCIAL_FOLLOWER_LABELS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_POST_KIND_LABELS,
  type SocialAccountDto,
  type SocialPostDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { useDeleteRecord } from '@/components/app/useDeleteRecord';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { AccountHistory, PostHistory } from './FiguresHistory';
import { Change, compact, PlatformIcon } from './platform';
import { AccountFiguresDialog, AccountFormDialog, PostFiguresDialog, PostFormDialog, useIntegrations } from './SocialDialogs';
import { SocialOverview } from './SocialOverview';

const TABS = ['overview', 'accounts', 'posts'] as const;
type Tab = (typeof TABS)[number];

const right = { align: 'right' as const, headerClassName: 'text-right' };

/** Tells an administrator which platform connections are still missing, and only when it matters. */
function SetupNotice({ accounts }: { accounts: SocialAccountDto[] }) {
  const integrations = useIntegrations();
  if (!integrations.data) return null;
  const wants = (p: string[]) => accounts.some((a) => a.syncMode === 'automatic' && p.includes(a.platform));
  const missing = [
    !integrations.data.youtube && wants(['youtube']) && 'YouTube (YOUTUBE_API_KEY)',
    !integrations.data.meta && wants(['instagram', 'facebook']) && 'Facebook and Instagram (META_ACCESS_TOKEN)',
  ].filter(Boolean);
  if (!missing.length) return null;
  return (
    <p className="mb-4 flex gap-2 rounded-2xl border border-warning/30 bg-warning-soft p-3.5 text-sm text-warning">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Not connected yet: {missing.join(' and ')}. Accounts set to pull automatically will show an error until an administrator adds
        the setting to the API on Vercel. Figures can still be recorded by hand meanwhile.
      </span>
    </p>
  );
}

export default function SocialPage() {
  const { can } = useAuth();
  const canManage = can('social.manage');
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  // Every account, for the post form, the post filter and the setup notice.
  const allAccounts = useQuery({
    queryKey: [...qk.socialAccounts, 'all'],
    queryFn: ({ signal }) => api.list<SocialAccountDto>('/social/accounts', { page: 1, pageSize: 100 }, signal).then((r) => r.data),
  });
  const accounts = allAccounts.data ?? [];

  const [accountForm, setAccountForm] = useState<{ open: boolean; account: SocialAccountDto | null }>({ open: false, account: null });
  const [postForm, setPostForm] = useState<{ open: boolean; post: SocialPostDto | null }>({ open: false, post: null });
  const [accountFigures, setAccountFigures] = useState<SocialAccountDto | null>(null);
  const [postFigures, setPostFigures] = useState<SocialPostDto | null>(null);
  const [accountHistory, setAccountHistory] = useState<SocialAccountDto | null>(null);
  const [postHistory, setPostHistory] = useState<SocialPostDto | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.social });

  const syncNow = async (a: SocialAccountDto) => {
    try {
      await run(() => api.post(`/social/accounts/${a.id}/sync`), {
        pending: `Pulling figures from ${SOCIAL_PLATFORM_LABELS[a.platform]}…`,
        success: 'Figures updated',
      });
    } catch {
      // The error dialog already said what went wrong.
    } finally {
      void refresh();
    }
  };

  const setActive = async (a: SocialAccountDto, isActive: boolean) => {
    try {
      await run(() => api.patch(`/social/accounts/${a.id}/status`, { isActive }), { success: isActive ? 'Account restored' : 'Account archived' });
    } catch {
      // Reported by the error dialog.
    } finally {
      void refresh();
    }
  };

  /* ---------- Accounts table ---------- */
  const accountState = useTableState(['platform', 'isActive'], { sort: 'platform:asc' });
  const accountResult = useListQuery<SocialAccountDto>(qk.socialAccounts, '/social/accounts', accountState.query, tab === 'accounts');
  const deleteAccount = useDeleteRecord<SocialAccountDto>({
    path: '/social/accounts',
    queryKey: qk.social,
    noun: 'social media account',
    label: (a) => `@${a.handle}`,
    allowed: (a) => canManage && a.trackedPosts === 0 && !a.figuresDay,
  });

  const accountColumns: ColumnDef<SocialAccountDto>[] = [
    {
      id: 'handle',
      header: 'Account',
      meta: { sortKey: 'handle' },
      cell: ({ row: { original: a } }) => (
        <div className="flex items-center gap-3">
          <PlatformIcon platform={a.platform} />
          <div className="min-w-0">
            <CellLink onClick={() => setAccountHistory(a)}>@{a.handle}</CellLink>
            <div className="truncate text-xs text-ink-subtle">
              {SOCIAL_PLATFORM_LABELS[a.platform]}
              {a.displayName ? ` · ${a.displayName}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'followers',
      header: 'Followers',
      meta: { ...right, sortKey: 'followers' },
      cell: ({ row: { original: a } }) => (
        <span title={SOCIAL_FOLLOWER_LABELS[a.platform]} className="font-semibold tabular">
          {compact(a.followers)}
        </span>
      ),
    },
    { id: 'week', header: '7 days', meta: right, cell: ({ row }) => <Change value={row.original.followersChange7} /> },
    { id: 'month', header: '30 days', meta: right, cell: ({ row }) => <Change value={row.original.followersChange30} /> },
    { id: 'posts', header: 'Posts tracked', meta: right, cell: ({ row }) => row.original.trackedPosts },
    {
      id: 'updated',
      header: 'Figures',
      cell: ({ row: { original: a } }) => (
        <div className="text-xs">
          <Badge tone={a.syncMode === 'automatic' ? 'info' : 'neutral'}>{a.syncMode === 'automatic' ? 'Pulled daily' : 'By hand'}</Badge>
          <div className="mt-1 text-ink-subtle">
            {a.lastSyncError ? (
              <span className="text-warning" title={a.lastSyncError}>
                Last pull failed
              </span>
            ) : a.figuresDay ? (
              `As of ${formatDate(a.figuresDay)}`
            ) : (
              'None yet'
            )}
          </div>
        </div>
      ),
    },
  ];

  /* ---------- Posts table ---------- */
  const postState = useTableState(['platform', 'accountId', 'dateFrom', 'dateTo'], { sort: 'publishedAt:desc' });
  const postResult = useListQuery<SocialPostDto>(qk.socialPosts, '/social/posts', postState.query, tab === 'posts');
  const deletePost = useDeleteRecord<SocialPostDto>({
    path: '/social/posts',
    queryKey: qk.social,
    noun: 'post',
    label: (p) => `"${p.title}"`,
    allowed: (p) => canManage && !p.pulled,
  });

  const postColumns: ColumnDef<SocialPostDto>[] = [
    {
      id: 'title',
      header: 'Post',
      meta: { sortKey: 'title' },
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-3">
          {p.thumbnailUrl ? (
            <img src={p.thumbnailUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <PlatformIcon platform={p.account.platform} className="size-10 rounded-lg" />
          )}
          <div className="min-w-0">
            <CellLink onClick={() => setPostHistory(p)}>
              <span className="line-clamp-2">{p.title}</span>
            </CellLink>
            <div className="text-xs text-ink-subtle">
              @{p.account.handle}
              {p.kind ? ` · ${SOCIAL_POST_KIND_LABELS[p.kind as keyof typeof SOCIAL_POST_KIND_LABELS] ?? p.kind}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    { id: 'publishedAt', header: 'Published', meta: { sortKey: 'publishedAt' }, cell: ({ row }) => formatDate(row.original.publishedAt) },
    { id: 'views', header: 'Views', meta: { ...right, sortKey: 'views' }, cell: ({ row }) => <span className="tabular">{compact(row.original.views)}</span> },
    { id: 'likes', header: 'Likes', meta: { ...right, sortKey: 'likes' }, cell: ({ row }) => <span className="font-semibold tabular">{compact(row.original.likes)}</span> },
    { id: 'comments', header: 'Comments', meta: { ...right, sortKey: 'comments' }, cell: ({ row }) => <span className="tabular">{compact(row.original.comments)}</span> },
    { id: 'shares', header: 'Shares', meta: { ...right, sortKey: 'shares' }, cell: ({ row }) => <span className="tabular">{compact(row.original.shares)}</span> },
    {
      id: 'figuresDay',
      header: 'Figures',
      cell: ({ row: { original: p } }) => (
        <span className="text-xs text-ink-subtle">{p.figuresDay ? `${p.pulled ? 'Pulled' : 'Recorded'} ${formatRelative(p.figuresDay)}` : 'None yet'}</span>
      ),
    },
  ];

  const activeAccounts = accounts.filter((a) => a.isActive);
  const addAccount = () => setAccountForm({ open: true, account: null });
  const addPost = () => setPostForm({ open: true, post: null });

  return (
    <>
      <PageHeader
        title="Social Media"
        description="Followers, posts and engagement across the company's accounts. Figures are recorded once a day, pulled automatically where the platform allows."
        actions={
          canManage && (
            <>
              <Button variant="secondary" onClick={addPost} disabled={!activeAccounts.length}>
                <PenLine aria-hidden /> Add post
              </Button>
              <Button onClick={addAccount}>
                <Plus aria-hidden /> Add account
              </Button>
            </>
          )
        }
      />
      <SetupNotice accounts={activeAccounts} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="posts">Posts &amp; videos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SocialOverview onOpenPost={setPostHistory} onAddAccount={addAccount} canManage={canManage} />
        </TabsContent>

        <TabsContent value="accounts">
          <DataTable
            columns={accountColumns}
            result={accountResult}
            state={accountState}
            getRowId={(a) => a.id}
            onRowClick={setAccountHistory}
            rowActions={(a) => [
              { label: 'Record figures', icon: <PenLine />, hidden: !canManage, onSelect: () => setAccountFigures(a) },
              { label: 'Sync now', icon: <RefreshCw />, hidden: !canManage || a.syncMode !== 'automatic', onSelect: () => void syncNow(a) },
              { label: 'History', icon: <History />, onSelect: () => setAccountHistory(a) },
              { label: 'Open profile', icon: <ExternalLink />, hidden: !a.url, onSelect: () => window.open(a.url!, '_blank', 'noopener') },
              { label: 'Edit', icon: <Pencil />, hidden: !canManage, onSelect: () => setAccountForm({ open: true, account: a }) },
              {
                label: a.isActive ? 'Archive' : 'Restore',
                icon: a.isActive ? <Archive /> : <ArchiveRestore />,
                hidden: !canManage,
                onSelect: () => void setActive(a, !a.isActive),
              },
              deleteAccount.action(a),
            ]}
            caption="Social media accounts"
            searchPlaceholder="Search account name"
            filters={
              <>
                <FilterSelect
                  label="Platform"
                  value={accountState.filters.platform}
                  onChange={(v) => accountState.setFilter('platform', v)}
                  options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: SOCIAL_PLATFORM_LABELS[p] }))}
                />
                <FilterSelect
                  label="Status"
                  value={accountState.filters.isActive}
                  onChange={(v) => accountState.setFilter('isActive', v)}
                  options={[
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Archived' },
                  ]}
                />
              </>
            }
            emptyTitle="No accounts yet"
            emptyDescription="Add the company's social media accounts to start tracking them."
            emptyAction={
              canManage && (
                <Button size="sm" onClick={addAccount}>
                  <Plus aria-hidden /> Add account
                </Button>
              )
            }
          />
        </TabsContent>

        <TabsContent value="posts">
          <DataTable
            columns={postColumns}
            result={postResult}
            state={postState}
            getRowId={(p) => p.id}
            onRowClick={setPostHistory}
            rowActions={(p) => [
              { label: 'Record figures', icon: <PenLine />, hidden: !canManage, onSelect: () => setPostFigures(p) },
              { label: 'History', icon: <History />, onSelect: () => setPostHistory(p) },
              { label: 'Open post', icon: <ExternalLink />, hidden: !p.url, onSelect: () => window.open(p.url!, '_blank', 'noopener') },
              { label: 'Edit', icon: <Pencil />, hidden: !canManage || p.pulled, onSelect: () => setPostForm({ open: true, post: p }) },
              deletePost.action(p),
            ]}
            caption="Posts and videos"
            searchPlaceholder="Search post titles"
            filters={
              <>
                <FilterSelect
                  label="Platform"
                  value={postState.filters.platform}
                  onChange={(v) => postState.setFilter('platform', v)}
                  options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: SOCIAL_PLATFORM_LABELS[p] }))}
                />
                <FilterSelect
                  label="Account"
                  value={postState.filters.accountId}
                  onChange={(v) => postState.setFilter('accountId', v)}
                  options={accounts.map((a) => ({ value: a.id, label: `@${a.handle}` }))}
                />
              </>
            }
            emptyTitle="No posts tracked yet"
            emptyDescription="Posts appear here by themselves for accounts pulled automatically. For the others, add the posts you want to follow."
            emptyAction={
              canManage &&
              activeAccounts.length > 0 && (
                <Button size="sm" onClick={addPost}>
                  <PenLine aria-hidden /> Add post
                </Button>
              )
            }
          />
        </TabsContent>
      </Tabs>

      {deleteAccount.dialog}
      {deletePost.dialog}
      {canManage && (
        <>
          <AccountFormDialog open={accountForm.open} account={accountForm.account} onOpenChange={(open) => setAccountForm((f) => ({ ...f, open }))} />
          <PostFormDialog
            open={postForm.open}
            post={postForm.post}
            accounts={activeAccounts}
            onOpenChange={(open) => setPostForm((f) => ({ ...f, open }))}
          />
          <AccountFiguresDialog account={accountFigures} onOpenChange={(o) => !o && setAccountFigures(null)} />
          <PostFiguresDialog post={postFigures} onOpenChange={(o) => !o && setPostFigures(null)} />
        </>
      )}
      <AccountHistory account={accountHistory} onClose={() => setAccountHistory(null)} />
      <PostHistory post={postHistory} onClose={() => setPostHistory(null)} />
    </>
  );
}
