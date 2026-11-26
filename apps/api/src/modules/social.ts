import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import {
  canPullAutomatically,
  socialAccountFiguresSchema,
  socialAccountInputSchema,
  socialAccountListQuerySchema,
  socialAccountStatusSchema,
  socialOverviewQuerySchema,
  socialPostFiguresSchema,
  socialPostInputSchema,
  socialPostListQuerySchema,
  SOCIAL_PLATFORM_LABELS,
  uuid,
  type SocialAccountDto,
  type SocialAccountFiguresDto,
  type SocialIntegrationsDto,
  type SocialOverviewDto,
  type SocialPostDto,
  type SocialPostFiguresDto,
} from '@tsm/shared';
import { getAuth, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, iso, isoDateOnly, optionalIso, optionalIsoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { deleteRecord } from '../services/delete-record';
import { recordAccountFigures, recordPostFigures, syncAccount, utcDay } from '../services/social/figures';
import { listMetaAccounts, metaConfigured, SyncError, youtubeConfigured } from '../services/social/platforms';

/**
 * Social media tracking: the company's accounts, their posts and videos, and their
 * figures over time. Company-wide (not branch-scoped). Reading needs social.read;
 * everything that changes data needs social.manage.
 */
export const socialRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (day: Date, n: number) => new Date(day.getTime() - n * DAY_MS);
const DUPLICATE_ACCOUNT = 'This account is already being tracked. Open the existing one instead.';

socialRouter.use(requirePermission('social.read'));

/* ---------- Helpers ---------- */

type AccountRow = Prisma.SocialAccountGetPayload<{ include: { _count: { select: { posts: true } } } }>;

/** Followers on the latest snapshot on or before each target day, per account. */
async function followersOnOrBefore(accountIds: string[], day: Date) {
  if (!accountIds.length) return new Map<string, number | null>();
  const rows = await prisma.socialAccountSnapshot.findMany({
    where: { accountId: { in: accountIds }, day: { lte: day }, followers: { not: null } },
    orderBy: [{ accountId: 'asc' }, { day: 'desc' }],
    distinct: ['accountId'],
    select: { accountId: true, followers: true },
  });
  return new Map(rows.map((r) => [r.accountId, r.followers]));
}

async function accountDtos(rows: AccountRow[]): Promise<SocialAccountDto[]> {
  const today = utcDay();
  const ids = rows.map((r) => r.id);
  const [week, month] = await Promise.all([followersOnOrBefore(ids, daysAgo(today, 7)), followersOnOrBefore(ids, daysAgo(today, 30))]);
  const change = (current: number | null, before: number | null | undefined) =>
    current != null && before != null ? current - before : null;
  return rows.map((a) => ({
    id: a.id,
    platform: a.platform,
    handle: a.handle,
    displayName: a.displayName,
    url: a.url,
    externalId: a.externalId,
    syncMode: a.syncMode,
    isActive: a.isActive,
    followers: a.followers,
    following: a.following,
    postCount: a.postCount,
    totalViews: a.totalViews,
    figuresDay: optionalIsoDateOnly(a.figuresDay),
    followersChange7: change(a.followers, week.get(a.id)),
    followersChange30: change(a.followers, month.get(a.id)),
    lastSyncedAt: optionalIso(a.lastSyncedAt),
    lastSyncError: a.lastSyncError,
    trackedPosts: a._count.posts,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  }));
}

const accountInclude = { _count: { select: { posts: true } } } satisfies Prisma.SocialAccountInclude;

async function loadAccount(id: string) {
  const row = await prisma.socialAccount.findUnique({ where: { id }, include: accountInclude });
  if (!row) throw notFound('The social media account');
  return row;
}

const postInclude = { account: { select: { id: true, platform: true, handle: true } } } satisfies Prisma.SocialPostInclude;
type PostRow = Prisma.SocialPostGetPayload<{ include: typeof postInclude }>;

function postDto(p: PostRow): SocialPostDto {
  return {
    id: p.id,
    account: p.account,
    externalId: p.externalId,
    url: p.url,
    title: p.title,
    kind: p.kind,
    publishedAt: optionalIso(p.publishedAt),
    thumbnailUrl: p.thumbnailUrl,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
    figuresDay: optionalIsoDateOnly(p.figuresDay),
    pulled: p.externalId !== null,
    createdAt: iso(p.createdAt),
  };
}

async function loadPost(id: string) {
  const row = await prisma.socialPost.findUnique({ where: { id }, include: postInclude });
  if (!row) throw notFound('The post');
  return row;
}

/** A figure for a day that hasn't happened yet would distort every chart. */
function assertNotFuture(day: Date) {
  if (day.getTime() > utcDay().getTime()) {
    throw new AppError('VALIDATION_FAILED', "Figures can't be recorded for a future day.", { day: "Choose today or an earlier day." });
  }
}

function friendlyUnique<T>(work: () => Promise<T>, message: string, field: string): Promise<T> {
  return work().catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('DUPLICATE', message, { [field]: message });
    }
    throw error;
  });
}

/* ---------- Setup status ---------- */

socialRouter.get('/integrations', (_req, res) => {
  const data: SocialIntegrationsDto = { youtube: youtubeConfigured(), meta: metaConfigured() };
  ok(res, data);
});

/** Facebook Pages and Instagram accounts the Meta token can read, to pick from in the form. */
socialRouter.get('/meta-accounts', requirePermission('social.manage'), async (_req, res) => {
  if (!metaConfigured()) throw new AppError('SERVICE_UNAVAILABLE', 'Facebook and Instagram are not connected yet. Ask an administrator to add META_ACCESS_TOKEN.');
  try {
    ok(res, await listMetaAccounts());
  } catch (error) {
    if (error instanceof SyncError) throw new AppError('SERVICE_UNAVAILABLE', error.message);
    throw error;
  }
});

/* ---------- Accounts ---------- */

socialRouter.get('/accounts', async (req, res) => {
  const query = parse(socialAccountListQuerySchema, req.query);
  const and: Prisma.SocialAccountWhereInput[] = [];
  if (query.platform) and.push({ platform: query.platform });
  if (query.isActive) and.push({ isActive: query.isActive === 'true' });
  if (query.q) {
    and.push({ OR: [{ handle: { contains: query.q, mode: 'insensitive' } }, { displayName: { contains: query.q, mode: 'insensitive' } }] });
  }
  const where: Prisma.SocialAccountWhereInput = { AND: and };
  const sort = orderBy<Prisma.SocialAccountOrderByWithRelationInput[]>(
    query.sort,
    {
      handle: (dir) => [{ handle: dir }],
      platform: (dir) => [{ platform: dir }, { handle: 'asc' }],
      followers: (dir) => [{ followers: { sort: dir, nulls: 'last' } }],
    },
    [{ platform: 'asc' }, { handle: 'asc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.socialAccount.findMany({ where, orderBy: sort, include: accountInclude, ...pageWindow(query) }),
    prisma.socialAccount.count({ where }),
  ]);
  ok(res, await accountDtos(rows), pageMeta(query, total));
});

socialRouter.get('/accounts/:id', async (req, res) => {
  ok(res, (await accountDtos([await loadAccount(parse(uuid, req.params.id))]))[0]);
});

socialRouter.post('/accounts', requirePermission('social.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(socialAccountInputSchema, req.body);
  const row = await friendlyUnique(
    () =>
      prisma.$transaction(async (tx) => {
        const account = await tx.socialAccount.create({ data: { ...input, createdById: ctx.profileId }, include: accountInclude });
        await recordAudit(tx, actorFrom(req), {
          action: 'social_account.created',
          entityType: 'social_account',
          entityId: account.id,
          summary: `${SOCIAL_PLATFORM_LABELS[account.platform]} account @${account.handle} added`,
        });
        return account;
      }),
    DUPLICATE_ACCOUNT,
    'handle',
  );
  // Pull straight away, so the account doesn't sit empty until tomorrow's run.
  if (row.syncMode === 'automatic') await syncAccount(row.id);
  created(res, (await accountDtos([await loadAccount(row.id)]))[0]);
});

socialRouter.put('/accounts/:id', requirePermission('social.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(socialAccountInputSchema, req.body);
  const before = await loadAccount(id);
  await friendlyUnique(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.socialAccount.update({
          where: { id },
          // A changed platform or account id makes the last pull's error meaningless.
          data: { ...input, ...(input.externalId !== before.externalId || input.syncMode !== before.syncMode ? { lastSyncError: null } : {}) },
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'social_account.updated',
          entityType: 'social_account',
          entityId: id,
          summary: `${SOCIAL_PLATFORM_LABELS[input.platform]} account @${input.handle} updated`,
        });
      }),
    DUPLICATE_ACCOUNT,
    'handle',
  );
  ok(res, (await accountDtos([await loadAccount(id)]))[0]);
});

socialRouter.patch('/accounts/:id/status', requirePermission('social.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { isActive } = parse(socialAccountStatusSchema, req.body);
  const before = await loadAccount(id);
  await prisma.$transaction(async (tx) => {
    await tx.socialAccount.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, actorFrom(req), {
      action: isActive ? 'social_account.restored' : 'social_account.archived',
      entityType: 'social_account',
      entityId: id,
      summary: `@${before.handle} ${isActive ? 'restored' : 'archived'}`,
    });
  });
  ok(res, (await accountDtos([await loadAccount(id)]))[0]);
});

/** Only an account with no recorded history can be deleted; otherwise archive it. */
socialRouter.delete('/accounts/:id', requirePermission('social.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  await deleteRecord(req, 'social_account', id, 'social media account', async (tx) => {
    const row = await tx.socialAccount.findUnique({ where: { id }, include: { _count: { select: { snapshots: true, posts: true } } } });
    if (!row) throw notFound('The social media account');
    if (row._count.snapshots > 0 || row._count.posts > 0) {
      throw invalidState(`@${row.handle} has recorded figures or posts. Archive it instead, so its history is kept.`);
    }
    await tx.socialAccount.delete({ where: { id } });
    return `${SOCIAL_PLATFORM_LABELS[row.platform]} account @${row.handle} deleted`;
  });
  res.status(204).end();
});

socialRouter.post('/accounts/:id/figures', requirePermission('social.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(socialAccountFiguresSchema, req.body);
  const day = dateFromIso(input.day);
  assertNotFuture(day);
  const account = await loadAccount(id);
  await prisma.$transaction(async (tx) => {
    await recordAccountFigures(
      tx,
      id,
      day,
      { followers: input.followers ?? null, following: input.following ?? null, postCount: input.postCount ?? null, totalViews: input.totalViews ?? null },
      'manual',
      ctx.profileId,
    );
    await recordAudit(tx, actorFrom(req), {
      action: 'social_account.figures_recorded',
      entityType: 'social_account',
      entityId: id,
      summary: `Figures for @${account.handle} on ${input.day} recorded${input.followers != null ? ` (${input.followers} followers)` : ''}`,
    });
  });
  ok(res, (await accountDtos([await loadAccount(id)]))[0]);
});

socialRouter.get('/accounts/:id/figures', async (req, res) => {
  const id = parse(uuid, req.params.id);
  await loadAccount(id);
  const rows = await prisma.socialAccountSnapshot.findMany({
    where: { accountId: id, day: { gte: daysAgo(utcDay(), 365) } },
    orderBy: { day: 'asc' },
    include: { recordedBy: { select: { fullName: true } } },
  });
  const data: SocialAccountFiguresDto[] = rows.map((r) => ({
    day: isoDateOnly(r.day),
    followers: r.followers,
    following: r.following,
    postCount: r.postCount,
    totalViews: r.totalViews,
    source: r.source,
    recordedBy: r.recordedBy?.fullName ?? null,
  }));
  ok(res, data);
});

const syncLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('RATE_LIMITED', 'Figures have been pulled many times in the last hour. They also update by themselves every morning.')),
});

socialRouter.post('/accounts/:id/sync', requirePermission('social.manage'), syncLimiter, async (req, res) => {
  const id = parse(uuid, req.params.id);
  const account = await loadAccount(id);
  if (account.syncMode !== 'automatic' || !canPullAutomatically(account.platform)) {
    throw invalidState(`@${account.handle} is recorded by hand. Use Record figures instead.`);
  }
  const result = await syncAccount(id);
  if (!result.ok) throw new AppError('SERVICE_UNAVAILABLE', result.message);
  ok(res, { ...result, account: (await accountDtos([await loadAccount(id)]))[0] });
});

/* ---------- Posts and videos ---------- */

socialRouter.get('/posts', async (req, res) => {
  const query = parse(socialPostListQuerySchema, req.query);
  const and: Prisma.SocialPostWhereInput[] = [];
  if (query.accountId) and.push({ accountId: query.accountId });
  if (query.platform) and.push({ account: { platform: query.platform } });
  if (query.dateFrom) and.push({ publishedAt: { gte: dateFromIso(query.dateFrom) } });
  if (query.dateTo) and.push({ publishedAt: { lt: new Date(dateFromIso(query.dateTo).getTime() + DAY_MS) } });
  if (query.q) and.push({ title: { contains: query.q, mode: 'insensitive' } });
  const where: Prisma.SocialPostWhereInput = { AND: and };
  const desc = (field: 'likes' | 'views' | 'comments' | 'shares' | 'publishedAt') => (dir: 'asc' | 'desc') => [
    { [field]: { sort: dir, nulls: 'last' } } as Prisma.SocialPostOrderByWithRelationInput,
  ];
  const sort = orderBy<Prisma.SocialPostOrderByWithRelationInput[]>(
    query.sort,
    { publishedAt: desc('publishedAt'), likes: desc('likes'), views: desc('views'), comments: desc('comments'), shares: desc('shares'), title: (dir) => [{ title: dir }] },
    [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  );
  const [rows, total] = await Promise.all([
    prisma.socialPost.findMany({ where, orderBy: sort, include: postInclude, ...pageWindow(query) }),
    prisma.socialPost.count({ where }),
  ]);
  ok(res, rows.map(postDto), pageMeta(query, total));
});

socialRouter.get('/posts/:id', async (req, res) => {
  ok(res, postDto(await loadPost(parse(uuid, req.params.id))));
});

socialRouter.post('/posts', requirePermission('social.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(socialPostInputSchema, req.body);
  const account = await loadAccount(input.accountId);
  const row = await prisma.$transaction(async (tx) => {
    const post = await tx.socialPost.create({
      data: {
        accountId: input.accountId,
        title: input.title,
        url: input.url ?? null,
        kind: input.kind ?? null,
        publishedAt: input.publishedAt ? dateFromIso(input.publishedAt) : null,
        createdById: ctx.profileId,
      },
      include: postInclude,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'social_post.created',
      entityType: 'social_post',
      entityId: post.id,
      summary: `Post "${post.title.slice(0, 80)}" added to @${account.handle}`,
    });
    return post;
  });
  created(res, postDto(row));
});

socialRouter.put('/posts/:id', requirePermission('social.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(socialPostInputSchema, req.body);
  const before = await loadPost(id);
  if (before.externalId) throw invalidState('This post is pulled from the platform; its details update by themselves.');
  if (input.accountId !== before.accountId) await loadAccount(input.accountId);
  const row = await prisma.$transaction(async (tx) => {
    const post = await tx.socialPost.update({
      where: { id },
      data: {
        accountId: input.accountId,
        title: input.title,
        url: input.url ?? null,
        kind: input.kind ?? null,
        publishedAt: input.publishedAt ? dateFromIso(input.publishedAt) : null,
      },
      include: postInclude,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'social_post.updated',
      entityType: 'social_post',
      entityId: id,
      summary: `Post "${post.title.slice(0, 80)}" updated`,
    });
    return post;
  });
  ok(res, postDto(row));
});

socialRouter.delete('/posts/:id', requirePermission('social.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  await deleteRecord(req, 'social_post', id, 'post', async (tx) => {
    const row = await tx.socialPost.findUnique({ where: { id } });
    if (!row) throw notFound('The post');
    if (row.externalId) throw invalidState('This post is pulled from the platform and would come back on the next pull.');
    await tx.socialPost.delete({ where: { id } });
    return `Post "${row.title.slice(0, 80)}" and its figures deleted`;
  });
  res.status(204).end();
});

socialRouter.post('/posts/:id/figures', requirePermission('social.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(socialPostFiguresSchema, req.body);
  const day = dateFromIso(input.day);
  assertNotFuture(day);
  const post = await loadPost(id);
  await prisma.$transaction(async (tx) => {
    await recordPostFigures(
      tx,
      id,
      day,
      { views: input.views ?? null, likes: input.likes ?? null, comments: input.comments ?? null, shares: input.shares ?? null, saves: input.saves ?? null },
      'manual',
      ctx.profileId,
    );
    await recordAudit(tx, actorFrom(req), {
      action: 'social_post.figures_recorded',
      entityType: 'social_post',
      entityId: id,
      summary: `Figures for "${post.title.slice(0, 60)}" on ${input.day} recorded`,
    });
  });
  ok(res, postDto(await loadPost(id)));
});

socialRouter.get('/posts/:id/figures', async (req, res) => {
  const id = parse(uuid, req.params.id);
  await loadPost(id);
  const rows = await prisma.socialPostSnapshot.findMany({
    where: { postId: id },
    orderBy: { day: 'asc' },
    take: 400,
    include: { recordedBy: { select: { fullName: true } } },
  });
  const data: SocialPostFiguresDto[] = rows.map((r) => ({
    day: isoDateOnly(r.day),
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    source: r.source,
    recordedBy: r.recordedBy?.fullName ?? null,
  }));
  ok(res, data);
});

/* ---------- Overview ---------- */

socialRouter.get('/overview', async (req, res) => {
  const { days } = parse(socialOverviewQuerySchema, req.query);
  const to = utcDay();
  const from = daysAgo(to, days - 1);
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true },
    orderBy: [{ platform: 'asc' }, { handle: 'asc' }],
  });
  const ids = accounts.map((a) => a.id);

  const [baseline, inPeriod, posts, topPosts] = await Promise.all([
    // The last known figure before the period starts, for the change and the chart's first point.
    followersOnOrBefore(ids, daysAgo(from, 1)),
    prisma.socialAccountSnapshot.findMany({
      where: { accountId: { in: ids }, day: { gte: from, lte: to } },
      orderBy: { day: 'asc' },
      select: { accountId: true, day: true, followers: true },
    }),
    prisma.socialPost.groupBy({
      by: ['accountId'],
      where: { accountId: { in: ids }, publishedAt: { gte: from, lt: new Date(to.getTime() + DAY_MS) } },
      _count: { _all: true },
      _sum: { likes: true, views: true, comments: true },
    }),
    prisma.socialPost.findMany({
      where: { accountId: { in: ids }, publishedAt: { gte: from, lt: new Date(to.getTime() + DAY_MS) } },
      orderBy: [{ likes: { sort: 'desc', nulls: 'last' } }, { views: { sort: 'desc', nulls: 'last' } }],
      take: 6,
      include: postInclude,
    }),
  ]);

  // Earliest figure inside the period, for accounts first tracked during it.
  const firstInPeriod = new Map<string, number>();
  for (const s of inPeriod) if (s.followers != null && !firstInPeriod.has(s.accountId)) firstInPeriod.set(s.accountId, s.followers);
  const byAccount = new Map(posts.map((p) => [p.accountId, p]));

  const rows: SocialOverviewDto['accounts'] = accounts.map((a) => {
    const start = baseline.get(a.id) ?? firstInPeriod.get(a.id) ?? null;
    const p = byAccount.get(a.id);
    return {
      id: a.id,
      platform: a.platform,
      handle: a.handle,
      displayName: a.displayName,
      followers: a.followers,
      followersChange: a.followers != null && start != null ? a.followers - start : null,
      postsInPeriod: p?._count._all ?? 0,
      likesInPeriod: p?._sum.likes ?? 0,
      viewsInPeriod: p?._sum.views ?? 0,
      lastSyncError: a.lastSyncError,
      syncMode: a.syncMode,
    };
  });

  // Daily series: each account carries its last known follower count forward.
  const latest = new Map<string, number | null>(ids.map((id) => [id, baseline.get(id) ?? null]));
  const byDay = new Map<string, { accountId: string; followers: number | null }[]>();
  for (const s of inPeriod) {
    const key = isoDateOnly(s.day);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const followerSeries: SocialOverviewDto['followerSeries'] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const key = isoDateOnly(new Date(t));
    for (const s of byDay.get(key) ?? []) if (s.followers != null) latest.set(s.accountId, s.followers);
    followerSeries.push({ day: key, values: Object.fromEntries(latest) });
  }

  const totals = rows.reduce(
    (t, r) => ({
      followers: t.followers + (r.followers ?? 0),
      followersChange: t.followersChange + (r.followersChange ?? 0),
      posts: t.posts + r.postsInPeriod,
      likes: t.likes + r.likesInPeriod,
      views: t.views + r.viewsInPeriod,
      comments: t.comments + (byAccount.get(r.id)?._sum.comments ?? 0),
    }),
    { followers: 0, followersChange: 0, posts: 0, likes: 0, views: 0, comments: 0 },
  );

  const data: SocialOverviewDto = {
    days,
    from: isoDateOnly(from),
    to: isoDateOnly(to),
    accounts: rows,
    followerSeries,
    topPosts: topPosts.map(postDto),
    totals,
  };
  ok(res, data);
});
