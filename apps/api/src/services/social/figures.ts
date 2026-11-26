import type { SocialFigureSource } from '@prisma/client';
import { logger } from '../../lib/logger';
import { prisma, type Db, type Tx } from '../../lib/prisma';
import { pull, SyncError } from './platforms';

/**
 * Recording figures. One snapshot per account (or post) per day: recording the same day
 * again replaces it. The latest figures are copied onto the account or post only when the
 * recorded day is the newest one, so back-filling an old day never overwrites today's.
 */

export const utcDay = (d = new Date()) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);

export interface AccountFigures {
  followers: number | null;
  following: number | null;
  postCount: number | null;
  totalViews: number | null;
}

export interface PostFigures {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

const isLatest = (day: Date, current: Date | null) => !current || day.getTime() >= current.getTime();

export async function recordAccountFigures(
  tx: Tx,
  accountId: string,
  day: Date,
  figures: AccountFigures,
  source: SocialFigureSource,
  recordedById: string | null,
) {
  await tx.socialAccountSnapshot.upsert({
    where: { accountId_day: { accountId, day } },
    create: { accountId, day, ...figures, source, recordedById },
    update: { ...figures, source, recordedById },
  });
  const account = await tx.socialAccount.findUniqueOrThrow({ where: { id: accountId }, select: { figuresDay: true } });
  if (isLatest(day, account.figuresDay)) {
    await tx.socialAccount.update({ where: { id: accountId }, data: { ...figures, figuresDay: day } });
  }
}

export async function recordPostFigures(
  tx: Tx,
  postId: string,
  day: Date,
  figures: PostFigures,
  source: SocialFigureSource,
  recordedById: string | null,
) {
  await tx.socialPostSnapshot.upsert({
    where: { postId_day: { postId, day } },
    create: { postId, day, ...figures, source, recordedById },
    update: { ...figures, source, recordedById },
  });
  const post = await tx.socialPost.findUniqueOrThrow({ where: { id: postId }, select: { figuresDay: true } });
  if (isLatest(day, post.figuresDay)) {
    await tx.socialPost.update({ where: { id: postId }, data: { ...figures, figuresDay: day } });
  }
}

export interface SyncResult {
  accountId: string;
  ok: boolean;
  message: string;
  postsUpdated: number;
}

/**
 * Pull one account's figures and its newest posts from the platform and record them for
 * today. A failure is stored on the account (shown on the page) and returned, never thrown,
 * so one broken account doesn't stop the others.
 */
export async function syncAccount(accountId: string, db: Db = prisma): Promise<SyncResult> {
  const account = await db.socialAccount.findUnique({ where: { id: accountId } });
  if (!account) return { accountId, ok: false, message: 'The account could not be found.', postsUpdated: 0 };
  if (account.syncMode !== 'automatic') {
    return { accountId, ok: false, message: 'This account is recorded by hand.', postsUpdated: 0 };
  }

  let pulled;
  try {
    pulled = await pull(account);
  } catch (error) {
    const message = error instanceof SyncError ? error.message : 'The figures could not be pulled. Try again later.';
    if (!(error instanceof SyncError)) logger.error({ err: error, accountId }, 'social sync failed');
    await prisma.socialAccount.update({ where: { id: accountId }, data: { lastSyncError: message, lastSyncedAt: new Date() } });
    return { accountId, ok: false, message, postsUpdated: 0 };
  }

  const today = utcDay();
  await prisma.$transaction(async (tx) => {
    await recordAccountFigures(tx, accountId, today, pulled.account, 'automatic', null);
    await tx.socialAccount.update({
      where: { id: accountId },
      data: {
        externalId: account.externalId ?? pulled.account.externalId,
        displayName: account.displayName ?? pulled.account.displayName,
        url: account.url ?? pulled.account.url,
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });
  });

  // One short transaction per post keeps each post and its snapshot consistent without
  // holding a long transaction open across fifty round trips.
  for (const p of pulled.posts) {
    await prisma.$transaction(async (tx) => {
      const post = await tx.socialPost.upsert({
        where: { accountId_externalId: { accountId, externalId: p.externalId } },
        create: {
          accountId,
          externalId: p.externalId,
          url: p.url,
          title: p.title,
          kind: p.kind,
          publishedAt: p.publishedAt,
          thumbnailUrl: p.thumbnailUrl,
        },
        update: { url: p.url, title: p.title, kind: p.kind, publishedAt: p.publishedAt, thumbnailUrl: p.thumbnailUrl },
        select: { id: true },
      });
      await recordPostFigures(
        tx,
        post.id,
        today,
        { views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves },
        'automatic',
        null,
      );
    });
  }

  const posts = pulled.posts.length;
  return {
    accountId,
    ok: true,
    message: `Updated the account and ${posts} recent post${posts === 1 ? '' : 's'}.`,
    postsUpdated: posts,
  };
}

/** The daily job: every active account set to pull automatically. Returns how many succeeded. */
export async function syncAllAccounts(): Promise<number> {
  const accounts = await prisma.socialAccount.findMany({
    where: { isActive: true, syncMode: 'automatic' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  let ok = 0;
  for (const a of accounts) {
    if ((await syncAccount(a.id)).ok) ok++;
  }
  return ok;
}
