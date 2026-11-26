import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  canPullAutomatically,
  SOCIAL_FOLLOWER_LABELS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_POST_KIND_LABELS,
  SOCIAL_POST_KINDS,
  socialAccountFiguresSchema,
  socialAccountInputSchema,
  socialPostFiguresSchema,
  socialPostInputSchema,
  type SocialAccountDto,
  type SocialAccountFiguresInput,
  type SocialAccountInput,
  type SocialIntegrationsDto,
  type SocialMetaAccountOptionDto,
  type SocialPostDto,
  type SocialPostFiguresInput,
  type SocialPostInput,
} from '@tsm/shared';
import { FormDialog } from '@/components/app/dialogs';
import { Field, FormGrid, useIdempotencyKey } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { useKeepInput } from '@/components/app/useKeepInput';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { zodForm } from '@/lib/zodForm';
import { cn } from '@/lib/utils';
import { compact } from './platform';

const refreshAll = (queryClient: ReturnType<typeof useQueryClient>) => queryClient.invalidateQueries({ queryKey: qk.social });

export function useIntegrations() {
  return useQuery({
    queryKey: qk.socialIntegrations,
    queryFn: ({ signal }) => api.get<SocialIntegrationsDto>('/social/integrations', undefined, signal),
    staleTime: 5 * 60_000,
  });
}

/* ---------- Account ---------- */

type AccountOutput = z.output<typeof socialAccountInputSchema>;

const accountValues = (a: SocialAccountDto | null): SocialAccountInput => ({
  platform: a?.platform ?? 'instagram',
  handle: a?.handle ?? '',
  displayName: a?.displayName ?? '',
  url: a?.url ?? '',
  externalId: a?.externalId ?? '',
  syncMode: a?.syncMode ?? 'manual',
});

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: SocialAccountDto | null;
}) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const recovery = useKeepInput();
  const integrations = useIntegrations();
  const form = useForm<SocialAccountInput, unknown, AccountOutput>({ resolver: zodForm(socialAccountInputSchema), defaultValues: accountValues(account) });
  const { errors, isDirty } = form.formState;
  const platform = form.watch('platform');
  const syncMode = form.watch('syncMode');
  const isMeta = platform === 'instagram' || platform === 'facebook';
  const connected = platform === 'youtube' ? integrations.data?.youtube : isMeta ? integrations.data?.meta : false;
  const automaticAllowed = canPullAutomatically(platform);

  const metaAccounts = useQuery({
    queryKey: [...qk.social, 'meta-accounts'],
    queryFn: ({ signal }) => api.get<SocialMetaAccountOptionDto[]>('/social/meta-accounts', undefined, signal),
    enabled: open && isMeta && syncMode === 'automatic' && Boolean(integrations.data?.meta),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const metaOptions = (metaAccounts.data ?? []).filter((o) => o.platform === platform);

  useEffect(() => {
    if (open && !recovery.restoring()) form.reset(accountValues(account));
  }, [open, recovery, account, form]);

  // A platform without a free API can only be recorded by hand.
  useEffect(() => {
    if (!automaticAllowed && syncMode === 'automatic') form.setValue('syncMode', 'manual');
  }, [automaticAllowed, syncMode, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      await run(
        () =>
          account
            ? api.put<SocialAccountDto>(`/social/accounts/${account.id}`, values)
            : api.post<SocialAccountDto>('/social/accounts', values, idem.keyFor(values)),
        {
          pending: values.syncMode === 'automatic' && !account ? 'Adding the account and pulling its figures…' : 'Saving…',
          success: account ? 'Account updated' : 'Account added',
        },
      );
      idem.reset();
    } catch {
      recovery.keepNextOpen();
      onOpenChange(true);
    } finally {
      void refreshAll(queryClient);
    }
  });

  const pickMeta = (id: string) => {
    const option = metaOptions.find((o) => o.id === id);
    form.setValue('externalId', id, { shouldDirty: true });
    if (option && !form.getValues('handle')) form.setValue('handle', (option.handle ?? option.name).toLowerCase().replace(/\s+/g, ''), { shouldDirty: true });
    if (option && !form.getValues('displayName')) form.setValue('displayName', option.name, { shouldDirty: true });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={account ? `Edit @${account.handle}` : 'Add a social media account'}
      description="One of the company's own accounts, to track its followers and posts."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field label="Platform" error={errors.platform?.message} required>
              <NativeSelect {...form.register('platform')}>
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {SOCIAL_PLATFORM_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Account name" error={errors.handle?.message} required hint="As on the platform, without the @">
              <Input autoFocus placeholder="transsasco" {...form.register('handle')} />
            </Field>
            <Field label="Display name" error={errors.displayName?.message}>
              <Input placeholder="Trans-Sas" {...form.register('displayName')} />
            </Field>
            <Field label="Profile link" error={errors.url?.message}>
              <Input type="url" placeholder="https://" {...form.register('url')} />
            </Field>

            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-ink">How figures are recorded</legend>
              <div role="radiogroup" className="mt-2 grid gap-2 sm:grid-cols-2">
                {(['automatic', 'manual'] as const).map((mode) => {
                  const disabled = mode === 'automatic' && !automaticAllowed;
                  return (
                    <label
                      key={mode}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-2xl border p-3 text-sm transition-colors',
                        syncMode === mode ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-strong',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input type="radio" value={mode} disabled={disabled} className="mt-1 accent-[var(--color-accent)]" {...form.register('syncMode')} />
                      <span>
                        <span className="block font-medium text-ink">{mode === 'automatic' ? 'Pull automatically' : 'Record by hand'}</span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {mode === 'automatic'
                            ? automaticAllowed
                              ? 'Every morning, and whenever you press Sync now.'
                              : `${SOCIAL_PLATFORM_LABELS[platform]} has no free API for this.`
                            : 'Your team types in the figures from the app.'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.syncMode?.message && <p className="mt-1.5 text-xs text-danger">{errors.syncMode.message}</p>}
              {syncMode === 'automatic' && integrations.data && !connected && (
                <p className="mt-2 rounded-xl bg-warning-soft p-3 text-xs text-warning">
                  {platform === 'youtube'
                    ? 'YouTube is not connected yet (YOUTUBE_API_KEY is not set), so pulls will fail until an administrator adds it.'
                    : 'Facebook and Instagram are not connected yet (META_ACCESS_TOKEN is not set), so pulls will fail until an administrator adds it.'}
                </p>
              )}
            </fieldset>

            {syncMode === 'automatic' && platform === 'youtube' && (
              <Field
                label="Channel id"
                error={errors.externalId?.message}
                className="sm:col-span-2"
                hint="Optional. Leave empty to find the channel from its @handle. It starts with UC."
              >
                <Input placeholder="UC…" {...form.register('externalId')} />
              </Field>
            )}
            {syncMode === 'automatic' && isMeta && (
              <Field
                label={platform === 'instagram' ? 'Instagram business account' : 'Facebook Page'}
                error={errors.externalId?.message}
                required
                className="sm:col-span-2"
                hint={
                  metaAccounts.isError
                    ? errorMessage(metaAccounts.error)
                    : metaOptions.length
                      ? 'The accounts the connected Meta token can read.'
                      : 'Its numeric id. Connect Meta to choose it from a list.'
                }
              >
                {metaOptions.length ? (
                  <NativeSelect value={form.watch('externalId') ?? ''} onChange={(e) => pickMeta(e.target.value)}>
                    <option value="">Choose…</option>
                    {metaOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.handle ? ` (@${o.handle})` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input inputMode="numeric" placeholder={metaAccounts.isFetching ? 'Loading accounts…' : '1784…'} {...form.register('externalId')} />
                )}
              </Field>
            )}
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{account ? 'Save changes' : 'Add account'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

/* ---------- Figures ---------- */

function FigureInput({ label, last, error, ...props }: { label: string; last: number | null | undefined; error?: string } & React.ComponentProps<typeof Input>) {
  return (
    <Field label={label} error={error} hint={last != null ? `Last recorded: ${compact(last)}` : undefined}>
      <Input inputMode="numeric" autoComplete="off" placeholder={last != null ? String(last) : ''} {...props} />
    </Field>
  );
}

type AccountFiguresOutput = z.output<typeof socialAccountFiguresSchema>;

export function AccountFiguresDialog({ account, onOpenChange }: { account: SocialAccountDto | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const empty: SocialAccountFiguresInput = { day: todayIso(), followers: '', following: '', postCount: '', totalViews: '' };
  const form = useForm<SocialAccountFiguresInput, unknown, AccountFiguresOutput>({ resolver: zodForm(socialAccountFiguresSchema), defaultValues: empty });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (account) form.reset({ ...empty, day: todayIso() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!account) return;
    onOpenChange(false);
    try {
      await run(() => api.post(`/social/accounts/${account.id}/figures`, values), { pending: 'Recording figures…', success: 'Figures recorded' });
    } finally {
      void refreshAll(queryClient);
    }
  });

  const followers = account ? SOCIAL_FOLLOWER_LABELS[account.platform] : 'Followers';

  return (
    <FormDialog
      open={Boolean(account)}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={account ? `Record figures for @${account.handle}` : 'Record figures'}
      description="Copy the numbers from the profile. Leave a box empty if the platform doesn't show it. Recording the same day again replaces it."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field label="Day" error={errors.day?.message} required className="sm:col-span-2">
              <Input type="date" max={todayIso()} {...form.register('day')} />
            </Field>
            <FigureInput label={followers} last={account?.followers} error={errors.followers?.message} {...form.register('followers')} />
            <FigureInput label="Following" last={account?.following} error={errors.following?.message} {...form.register('following')} />
            <FigureInput label="Posts" last={account?.postCount} error={errors.postCount?.message} {...form.register('postCount')} />
            <FigureInput label="Total views" last={account?.totalViews} error={errors.totalViews?.message} {...form.register('totalViews')} />
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">Record figures</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

type PostFiguresOutput = z.output<typeof socialPostFiguresSchema>;

export function PostFiguresDialog({ post, onOpenChange }: { post: SocialPostDto | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const empty: SocialPostFiguresInput = { day: todayIso(), views: '', likes: '', comments: '', shares: '', saves: '' };
  const form = useForm<SocialPostFiguresInput, unknown, PostFiguresOutput>({ resolver: zodForm(socialPostFiguresSchema), defaultValues: empty });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (post) form.reset({ ...empty, day: todayIso() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!post) return;
    onOpenChange(false);
    try {
      await run(() => api.post(`/social/posts/${post.id}/figures`, values), { pending: 'Recording figures…', success: 'Figures recorded' });
    } finally {
      void refreshAll(queryClient);
    }
  });

  return (
    <FormDialog
      open={Boolean(post)}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title="Record post figures"
      description={post ? `"${post.title}". Leave a box empty if the platform doesn't show it.` : undefined}
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          {post?.pulled && (
            <p className="mb-4 rounded-xl bg-info-soft p-3 text-xs text-info">
              This post&apos;s figures are pulled every morning. A figure you record for today will be replaced by the next pull.
            </p>
          )}
          <FormGrid>
            <Field label="Day" error={errors.day?.message} required className="sm:col-span-2">
              <Input type="date" max={todayIso()} {...form.register('day')} />
            </Field>
            <FigureInput label="Views" last={post?.views} error={errors.views?.message} {...form.register('views')} />
            <FigureInput label="Likes" last={post?.likes} error={errors.likes?.message} {...form.register('likes')} />
            <FigureInput label="Comments" last={post?.comments} error={errors.comments?.message} {...form.register('comments')} />
            <FigureInput label="Shares" last={post?.shares} error={errors.shares?.message} {...form.register('shares')} />
            <FigureInput label="Saves" last={post?.saves} error={errors.saves?.message} {...form.register('saves')} />
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">Record figures</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}

/* ---------- Post ---------- */

type PostOutput = z.output<typeof socialPostInputSchema>;

const postValues = (p: SocialPostDto | null, accountId?: string): SocialPostInput => ({
  accountId: p?.account.id ?? accountId ?? '',
  title: p?.title ?? '',
  url: p?.url ?? '',
  kind: (p?.kind as SocialPostInput['kind']) ?? 'post',
  publishedAt: p?.publishedAt?.slice(0, 10) ?? todayIso(),
});

export function PostFormDialog({
  open,
  onOpenChange,
  post,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: SocialPostDto | null;
  accounts: SocialAccountDto[];
}) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const recovery = useKeepInput();
  const form = useForm<SocialPostInput, unknown, PostOutput>({ resolver: zodForm(socialPostInputSchema), defaultValues: postValues(post, accounts[0]?.id) });
  const { errors, isDirty } = form.formState;

  useEffect(() => {
    if (open && !recovery.restoring()) form.reset(postValues(post, accounts[0]?.id));
  }, [open, recovery, post, accounts, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    onOpenChange(false);
    try {
      await run(
        () => (post ? api.put(`/social/posts/${post.id}`, values) : api.post('/social/posts', values, idem.keyFor(values))),
        { pending: 'Saving post…', success: post ? 'Post updated' : 'Post added' },
      );
      idem.reset();
    } catch {
      recovery.keepNextOpen();
      onOpenChange(true);
    } finally {
      void refreshAll(queryClient);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isDirty={isDirty}
      size="md"
      title={post ? 'Edit post' : 'Add a post or video'}
      description="For posts the app can't pull by itself. Record its figures afterwards, as often as you like."
    >
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          <FormGrid>
            <Field label="Account" error={errors.accountId?.message} required className="sm:col-span-2">
              <NativeSelect {...form.register('accountId')}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {SOCIAL_PLATFORM_LABELS[a.platform]} · @{a.handle}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Title or first line" error={errors.title?.message} required className="sm:col-span-2">
              <Input autoFocus {...form.register('title')} />
            </Field>
            <Field label="Link" error={errors.url?.message} className="sm:col-span-2">
              <Input type="url" placeholder="https://" {...form.register('url')} />
            </Field>
            <Field label="Type" error={errors.kind?.message}>
              <NativeSelect {...form.register('kind')}>
                {SOCIAL_POST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SOCIAL_POST_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Published on" error={errors.publishedAt?.message}>
              <Input type="date" max={todayIso()} {...form.register('publishedAt')} />
            </Field>
          </FormGrid>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{post ? 'Save changes' : 'Add post'}</Button>
        </DialogFooter>
      </form>
    </FormDialog>
  );
}
