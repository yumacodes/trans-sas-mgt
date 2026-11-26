import { z } from 'zod';
import { isoDate, listQuerySchema, optionalText, requiredText, uuid } from './common';

/**
 * Social media tracking. Each account's and post's figures are recorded once per day
 * (a second recording the same day replaces the first), either pulled from the platform
 * automatically or typed in by staff, so the history shows growth over time.
 */

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
};

/** Platforms the API can pull figures from for free. The rest are recorded by hand. */
export const SOCIAL_AUTOMATIC_PLATFORMS = ['youtube', 'instagram', 'facebook'] as const satisfies readonly SocialPlatform[];
export const canPullAutomatically = (p: SocialPlatform) => (SOCIAL_AUTOMATIC_PLATFORMS as readonly string[]).includes(p);

/** What the account-level "followers" figure is called on each platform. */
export const SOCIAL_FOLLOWER_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Followers',
  facebook: 'Followers',
  youtube: 'Subscribers',
  tiktok: 'Followers',
  x: 'Followers',
  linkedin: 'Followers',
};

export const SOCIAL_SYNC_MODES = ['manual', 'automatic'] as const;
export type SocialSyncMode = (typeof SOCIAL_SYNC_MODES)[number];

export const SOCIAL_POST_KINDS = ['post', 'video', 'reel', 'short', 'story', 'live'] as const;
export const SOCIAL_POST_KIND_LABELS: Record<(typeof SOCIAL_POST_KINDS)[number], string> = {
  post: 'Post',
  video: 'Video',
  reel: 'Reel',
  short: 'Short',
  story: 'Story',
  live: 'Live',
};

/** A whole-number figure, or empty when the platform doesn't show it. */
const count = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? v.trim().replace(/[,\s]/g, '') : String(v)))
    .refine((v) => v === '' || (/^\d{1,10}$/.test(v) && Number(v) <= 2_000_000_000), `${label} must be a whole number of zero or more.`)
    .transform((v) => (v === '' ? null : Number(v)))
    .nullable()
    .optional();

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Enter a full link starting with https://')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const socialAccountInputSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    handle: z
      .string({ required_error: 'Enter the account name.' })
      .transform((v) => v.trim().replace(/^@/, '').toLowerCase())
      .pipe(
        z
          .string()
          .min(1, 'Enter the account name.')
          .max(100)
          .regex(/^[a-z0-9._-]+$/, 'Use the name as it appears on the platform, without spaces.'),
      ),
    displayName: optionalText(120),
    url: optionalUrl,
    externalId: optionalText(100),
    syncMode: z.enum(SOCIAL_SYNC_MODES),
  })
  .superRefine((v, ctx) => {
    if (v.syncMode === 'automatic' && !canPullAutomatically(v.platform)) {
      ctx.addIssue({ code: 'custom', path: ['syncMode'], message: `${SOCIAL_PLATFORM_LABELS[v.platform]} figures can't be pulled automatically. Record them by hand.` });
    }
    if (v.syncMode === 'automatic' && (v.platform === 'instagram' || v.platform === 'facebook') && !v.externalId) {
      ctx.addIssue({ code: 'custom', path: ['externalId'], message: 'Choose the account from the list, or enter its id, to pull figures automatically.' });
    }
  });
export type SocialAccountInput = z.input<typeof socialAccountInputSchema>;

export const socialAccountStatusSchema = z.object({ isActive: z.boolean() });

export const socialAccountFiguresSchema = z
  .object({
    day: isoDate,
    followers: count('Followers'),
    following: count('Following'),
    postCount: count('Posts'),
    totalViews: count('Total views'),
  })
  .refine((v) => v.followers != null || v.following != null || v.postCount != null || v.totalViews != null, {
    message: 'Enter at least one figure.',
    path: ['followers'],
  });
export type SocialAccountFiguresInput = z.input<typeof socialAccountFiguresSchema>;

export const socialPostInputSchema = z.object({
  accountId: uuid,
  title: requiredText('Title', 300),
  url: optionalUrl,
  kind: z.enum(SOCIAL_POST_KINDS).nullable().optional(),
  publishedAt: isoDate.nullable().optional(),
});
export type SocialPostInput = z.input<typeof socialPostInputSchema>;

export const socialPostFiguresSchema = z
  .object({
    day: isoDate,
    views: count('Views'),
    likes: count('Likes'),
    comments: count('Comments'),
    shares: count('Shares'),
    saves: count('Saves'),
  })
  .refine((v) => [v.views, v.likes, v.comments, v.shares, v.saves].some((n) => n != null), {
    message: 'Enter at least one figure.',
    path: ['likes'],
  });
export type SocialPostFiguresInput = z.input<typeof socialPostFiguresSchema>;

export const socialAccountListQuerySchema = listQuerySchema.extend({
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const socialPostListQuerySchema = listQuerySchema.extend({
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  accountId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const socialOverviewQuerySchema = z.object({
  days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d), 'Choose 7, 30, 90 or 365 days.').default(30),
});

export interface SocialAccountDto {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string | null;
  url: string | null;
  externalId: string | null;
  syncMode: SocialSyncMode;
  isActive: boolean;
  followers: number | null;
  following: number | null;
  postCount: number | null;
  totalViews: number | null;
  /** Day the latest figures are for. */
  figuresDay: string | null;
  /** Followers gained (or lost) over the last 7 and 30 days, when there's a figure to compare with. */
  followersChange7: number | null;
  followersChange30: number | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  trackedPosts: number;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPostDto {
  id: string;
  account: { id: string; platform: SocialPlatform; handle: string };
  externalId: string | null;
  url: string | null;
  title: string;
  kind: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  figuresDay: string | null;
  /** True when the post came from an automatic pull (its figures then update daily). */
  pulled: boolean;
  createdAt: string;
}

export interface SocialAccountFiguresDto {
  day: string;
  followers: number | null;
  following: number | null;
  postCount: number | null;
  totalViews: number | null;
  source: 'manual' | 'automatic';
  recordedBy: string | null;
}

export interface SocialPostFiguresDto {
  day: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  source: 'manual' | 'automatic';
  recordedBy: string | null;
}

export interface SocialOverviewDto {
  days: number;
  from: string;
  to: string;
  accounts: {
    id: string;
    platform: SocialPlatform;
    handle: string;
    displayName: string | null;
    followers: number | null;
    /** Change over the selected period, null when there's no earlier figure. */
    followersChange: number | null;
    postsInPeriod: number;
    likesInPeriod: number;
    viewsInPeriod: number;
    lastSyncError: string | null;
    syncMode: SocialSyncMode;
  }[];
  /** One point per day per account: the latest known follower count on that day. */
  followerSeries: { day: string; values: Record<string, number | null> }[];
  /** Most liked posts published in the period. */
  topPosts: SocialPostDto[];
  totals: { followers: number; followersChange: number; posts: number; likes: number; views: number; comments: number };
}

export interface SocialSyncResultDto {
  accountId: string;
  ok: boolean;
  message: string;
  postsUpdated: number;
}

/** Status of the platform connections, for the setup hints on the page. */
export interface SocialIntegrationsDto {
  youtube: boolean;
  meta: boolean;
}

/** A Facebook Page or Instagram business account the Meta token can read. */
export interface SocialMetaAccountOptionDto {
  platform: 'facebook' | 'instagram';
  id: string;
  name: string;
  handle: string | null;
}
