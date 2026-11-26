import type { SocialAccount } from '@prisma/client';
import type { SocialMetaAccountOptionDto } from '@tsm/shared';
import { env } from '../../config/env';

/**
 * Pulls account and post figures from the platforms that offer them for free:
 *
 * - YouTube Data API v3, with an API key (YOUTUBE_API_KEY). Public figures only:
 *   subscribers, channel views, video count, and views/likes/comments per video.
 * - Meta Graph API, with one access token (META_ACCESS_TOKEN) that can read the company's
 *   Facebook Page and the Instagram business account linked to it: followers, posts, and
 *   likes/comments/shares per post. Views need extra insight permissions and are left out.
 *
 * Every failure becomes a SyncError whose message tells a business user what to do.
 */

export class SyncError extends Error {}

export interface PulledPost {
  externalId: string;
  url: string | null;
  title: string;
  kind: string | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface Pulled {
  account: {
    externalId: string;
    displayName: string | null;
    url: string | null;
    followers: number | null;
    following: number | null;
    postCount: number | null;
    totalViews: number | null;
  };
  posts: PulledPost[];
}

/** How many of the newest posts each pull refreshes. */
export const POSTS_PER_PULL = 50;

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 2_000_000_000) : null;
};

const firstLine = (text: string | null | undefined, fallback: string) => {
  const line = (text ?? '').split('\n').map((l) => l.trim()).find(Boolean);
  return (line ?? fallback).slice(0, 300);
};

async function getJson(url: URL, what: string): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new SyncError(`${what} didn't answer. Try again in a few minutes.`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

/* ---------- YouTube ---------- */

const YOUTUBE = 'https://www.googleapis.com/youtube/v3';

export const youtubeConfigured = () => Boolean(env().YOUTUBE_API_KEY);

async function youtube(path: string, params: Record<string, string>) {
  const key = env().YOUTUBE_API_KEY;
  if (!key) throw new SyncError('YouTube is not connected yet. Ask an administrator to add YOUTUBE_API_KEY to the API settings.');
  const url = new URL(`${YOUTUBE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const { status, body } = await getJson(url, 'YouTube');
  if (status === 200) return body;
  const error = body.error as { message?: string; errors?: { reason?: string }[] } | undefined;
  const reason = error?.errors?.[0]?.reason ?? '';
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
    throw new SyncError("YouTube's free daily limit has been used up. Figures will update tomorrow.");
  }
  if (reason === 'keyInvalid' || status === 400 || status === 403) {
    throw new SyncError('YouTube rejected the API key. Check YOUTUBE_API_KEY and that the YouTube Data API is enabled for it.');
  }
  throw new SyncError(`YouTube returned an error (${status}). Try again later.`);
}

/** ISO 8601 duration ("PT1M5S") in seconds. */
export function durationSeconds(iso: string | undefined): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  return d! * 86400 + h! * 3600 + min! * 60 + s!;
}

type YtItem = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function pullYoutube(account: Pick<SocialAccount, 'handle' | 'externalId'>): Promise<Pulled> {
  const channels = await youtube('channels', {
    part: 'snippet,statistics,contentDetails',
    ...(account.externalId ? { id: account.externalId } : { forHandle: `@${account.handle}` }),
  });
  const channel = (channels.items as YtItem[] | undefined)?.[0];
  if (!channel) {
    throw new SyncError(
      account.externalId
        ? `YouTube has no channel with the id ${account.externalId}. Check the channel id.`
        : `YouTube has no channel called @${account.handle}. Check the handle, or enter the channel id (it starts with UC).`,
    );
  }
  const stats = channel.statistics ?? {};
  const uploads: string | undefined = channel.contentDetails?.relatedPlaylists?.uploads;

  let posts: PulledPost[] = [];
  if (uploads) {
    const list = await youtube('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: String(POSTS_PER_PULL) });
    const ids = ((list.items as YtItem[] | undefined) ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
    if (ids.length) {
      const videos = await youtube('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
      posts = ((videos.items as YtItem[] | undefined) ?? []).map((v) => {
        const seconds = durationSeconds(v.contentDetails?.duration);
        const live = v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none';
        return {
          externalId: String(v.id),
          url: `https://www.youtube.com/watch?v=${v.id}`,
          title: firstLine(v.snippet?.title, 'Untitled video'),
          // YouTube no longer marks Shorts in the API; up to 3 minutes is the Shorts limit.
          kind: live ? 'live' : seconds !== null && seconds <= 180 ? 'short' : 'video',
          publishedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
          thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
          views: num(v.statistics?.viewCount),
          likes: num(v.statistics?.likeCount),
          comments: num(v.statistics?.commentCount),
          shares: null,
          saves: null,
        };
      });
    }
  }

  return {
    account: {
      externalId: String(channel.id),
      displayName: channel.snippet?.title ?? null,
      url: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : `https://www.youtube.com/channel/${channel.id}`,
      followers: stats.hiddenSubscriberCount ? null : num(stats.subscriberCount),
      following: null,
      postCount: num(stats.videoCount),
      totalViews: num(stats.viewCount),
    },
    posts,
  };
}

/* ---------- Meta: Facebook Pages and Instagram ---------- */

const GRAPH = 'https://graph.facebook.com/v21.0';

export const metaConfigured = () => Boolean(env().META_ACCESS_TOKEN);

async function graph(path: string, params: Record<string, string>, token?: string) {
  const accessToken = token ?? env().META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new SyncError('Facebook and Instagram are not connected yet. Ask an administrator to add META_ACCESS_TOKEN to the API settings.');
  }
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', accessToken);
  const { status, body } = await getJson(url, 'Meta');
  if (status === 200) return body;
  const error = body.error as { code?: number; error_subcode?: number; message?: string } | undefined;
  const code = error?.code;
  if (code === 190) {
    throw new SyncError('The Meta access token has expired or was revoked. Ask an administrator to create a new one and update META_ACCESS_TOKEN.');
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    throw new SyncError("Meta's rate limit was reached. Figures will update on the next pull.");
  }
  if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300)) {
    throw new SyncError("The Meta access token isn't allowed to read this account. It needs pages_read_engagement, instagram_basic and instagram_manage_insights.");
  }
  if (code === 100) {
    throw new SyncError("Meta doesn't recognise this account id. Choose the account again from the list in the account settings.");
  }
  throw new SyncError(`Meta returned an error (${status}). Try again later.`);
}

/** A Page's own token reads its posts; a user or system-user token is exchanged for it. */
async function pageToken(pageId: string): Promise<string | undefined> {
  try {
    const page = await graph(pageId, { fields: 'access_token' });
    return typeof page.access_token === 'string' ? page.access_token : undefined;
  } catch {
    // Already a Page token, or one without manage rights: use the configured token as is.
    return undefined;
  }
}

type GraphItem = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function pullFacebook(account: Pick<SocialAccount, 'externalId'>): Promise<Pulled> {
  if (!account.externalId) throw new SyncError('Choose the Facebook Page from the list in the account settings first.');
  const token = await pageToken(account.externalId);
  const page = await graph(account.externalId, { fields: 'name,link,followers_count,fan_count' }, token);
  const feed = await graph(
    `${account.externalId}/posts`,
    {
      fields:
        'id,message,permalink_url,created_time,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
      limit: String(POSTS_PER_PULL),
    },
    token,
  );
  const posts = ((feed.data as GraphItem[] | undefined) ?? []).map((p) => ({
    externalId: String(p.id),
    url: p.permalink_url ?? null,
    title: firstLine(p.message, 'Post without text'),
    kind: 'post',
    publishedAt: p.created_time ? new Date(p.created_time) : null,
    thumbnailUrl: p.full_picture ?? null,
    views: null,
    likes: num(p.reactions?.summary?.total_count),
    comments: num(p.comments?.summary?.total_count),
    shares: num(p.shares?.count ?? 0),
    saves: null,
  }));
  return {
    account: {
      externalId: account.externalId,
      displayName: (page.name as string) ?? null,
      url: (page.link as string) ?? null,
      followers: num(page.followers_count ?? page.fan_count),
      following: null,
      postCount: null,
      totalViews: null,
    },
    posts,
  };
}

export async function pullInstagram(account: Pick<SocialAccount, 'externalId' | 'handle'>): Promise<Pulled> {
  if (!account.externalId) throw new SyncError('Choose the Instagram account from the list in the account settings first.');
  const profile = await graph(account.externalId, { fields: 'username,name,followers_count,follows_count,media_count' });
  const media = await graph(`${account.externalId}/media`, {
    fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url',
    limit: String(POSTS_PER_PULL),
  });
  const posts = ((media.data as GraphItem[] | undefined) ?? []).map((m) => {
    const product = String(m.media_product_type ?? '').toUpperCase();
    const kind = product === 'REELS' ? 'reel' : product === 'STORY' ? 'story' : m.media_type === 'VIDEO' ? 'video' : 'post';
    return {
      externalId: String(m.id),
      url: m.permalink ?? null,
      title: firstLine(m.caption, kind === 'reel' ? 'Reel without caption' : 'Post without caption'),
      kind,
      publishedAt: m.timestamp ? new Date(m.timestamp) : null,
      thumbnailUrl: m.thumbnail_url ?? (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM' ? (m.media_url ?? null) : null),
      views: null,
      likes: num(m.like_count),
      comments: num(m.comments_count),
      shares: null,
      saves: null,
    };
  });
  const username = (profile.username as string | undefined) ?? account.handle;
  return {
    account: {
      externalId: account.externalId,
      displayName: (profile.name as string) ?? username,
      url: `https://www.instagram.com/${username}/`,
      followers: num(profile.followers_count),
      following: num(profile.follows_count),
      postCount: num(profile.media_count),
      totalViews: null,
    },
    posts,
  };
}

/** Facebook Pages and Instagram business accounts the token can read, for the account form. */
export async function listMetaAccounts(): Promise<SocialMetaAccountOptionDto[]> {
  const fields = 'id,name,username,instagram_business_account{id,username,name}';
  let pages: GraphItem[];
  try {
    pages = ((await graph('me/accounts', { fields, limit: '100' })).data as GraphItem[] | undefined) ?? [];
  } catch (error) {
    // A Page token answers /me as the Page itself.
    if (!(error instanceof SyncError)) throw error;
    pages = [await graph('me', { fields })];
  }
  const options: SocialMetaAccountOptionDto[] = [];
  for (const p of pages) {
    if (!p?.id) continue;
    options.push({ platform: 'facebook', id: String(p.id), name: String(p.name ?? p.id), handle: p.username ?? null });
    const ig = p.instagram_business_account;
    if (ig?.id) options.push({ platform: 'instagram', id: String(ig.id), name: String(ig.name ?? ig.username ?? ig.id), handle: ig.username ?? null });
  }
  return options;
}

export async function pull(account: SocialAccount): Promise<Pulled> {
  switch (account.platform) {
    case 'youtube':
      return pullYoutube(account);
    case 'facebook':
      return pullFacebook(account);
    case 'instagram':
      return pullInstagram(account);
    default:
      throw new SyncError('This platform has no free API for its figures. Record them by hand.');
  }
}
