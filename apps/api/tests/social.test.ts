import { SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Social media: the platform connectors (with the platforms' documented response shapes),
 * the rule that only the newest day updates an account's latest figures, and access checks.
 */
process.env.YOUTUBE_API_KEY = 'test-youtube-key';
process.env.META_ACCESS_TOKEN = 'test-meta-token';

const db = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  idempotencyRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  socialAccount: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  socialAccountSnapshot: { upsert: vi.fn(), findMany: vi.fn() },
  socialPost: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  socialPostSnapshot: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { createApp } = await import('../src/app');
const { durationSeconds, pullFacebook, pullInstagram, pullYoutube, SyncError } = await import('../src/services/social/platforms');
const { recordAccountFigures } = await import('../src/services/social/figures');
const app = createApp();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(routes: [RegExp, Response | (() => Response)][]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = String(input);
      calls.push(url);
      const hit = routes.find(([re]) => re.test(url));
      if (!hit) return json({ error: { message: 'unexpected' } }, 404);
      return typeof hit[1] === 'function' ? hit[1]() : hit[1].clone();
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.idempotencyRecord.create.mockResolvedValue({ id: 'idem-1' });
  db.idempotencyRecord.update.mockResolvedValue({});
  db.idempotencyRecord.delete.mockResolvedValue({});
});

describe('YouTube connector', () => {
  it('reads subscribers, views and each recent video, telling Shorts from videos', async () => {
    const calls = stubFetch([
      [
        /\/channels\?/,
        json({
          items: [
            {
              id: 'UC123',
              snippet: { title: 'Trans-Sas', customUrl: '@transsas' },
              statistics: { subscriberCount: '1520', viewCount: '98000', videoCount: '42', hiddenSubscriberCount: false },
              contentDetails: { relatedPlaylists: { uploads: 'UU123' } },
            },
          ],
        }),
      ],
      [/\/playlistItems\?/, json({ items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: { videoId: 'v2' } }] })],
      [
        /\/videos\?/,
        json({
          items: [
            { id: 'v1', snippet: { title: 'Incubator demo\nsecond line', publishedAt: '2026-11-01T10:00:00Z', liveBroadcastContent: 'none' }, statistics: { viewCount: '5000', likeCount: '320', commentCount: '14' }, contentDetails: { duration: 'PT4M10S' } },
            { id: 'v2', snippet: { title: 'Wheelchair in 30s', publishedAt: '2026-11-05T10:00:00Z', liveBroadcastContent: 'none' }, statistics: { viewCount: '900' }, contentDetails: { duration: 'PT30S' } },
          ],
        }),
      ],
    ]);
    const pulled = await pullYoutube({ handle: 'transsas', externalId: null });
    expect(calls[0]).toContain('forHandle=%40transsas');
    expect(calls[0]).toContain('key=test-youtube-key');
    expect(pulled.account).toMatchObject({ externalId: 'UC123', followers: 1520, totalViews: 98000, postCount: 42, url: 'https://www.youtube.com/@transsas' });
    expect(pulled.posts).toHaveLength(2);
    expect(pulled.posts[0]).toMatchObject({ externalId: 'v1', title: 'Incubator demo', kind: 'video', views: 5000, likes: 320, comments: 14 });
    // A hidden like count stays empty rather than becoming zero.
    expect(pulled.posts[1]).toMatchObject({ kind: 'short', likes: null, views: 900 });
  });

  it("explains a used-up daily quota instead of failing silently", async () => {
    stubFetch([[/\/channels\?/, json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403)]]);
    await expect(pullYoutube({ handle: 'x', externalId: 'UC1' })).rejects.toThrow(/daily limit/);
  });

  it('says plainly when the handle does not exist', async () => {
    stubFetch([[/\/channels\?/, json({ items: [] })]]);
    await expect(pullYoutube({ handle: 'nobody', externalId: null })).rejects.toBeInstanceOf(SyncError);
  });

  it('parses video durations', () => {
    expect(durationSeconds('PT1M5S')).toBe(65);
    expect(durationSeconds('PT2H')).toBe(7200);
    expect(durationSeconds('P1DT1S')).toBe(86401);
    expect(durationSeconds(undefined)).toBeNull();
  });
});

describe('Meta connectors', () => {
  it('reads an Instagram business account and tells reels from posts', async () => {
    stubFetch([
      [/\/17841\?/, json({ username: 'transsasco', name: 'Trans-Sas', followers_count: 2400, follows_count: 120, media_count: 88 })],
      [
        /\/17841\/media\?/,
        json({
          data: [
            { id: 'm1', caption: 'New stock in!', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://instagram.com/p/m1', timestamp: '2026-11-10T09:00:00+0000', like_count: 210, comments_count: 9, thumbnail_url: 'https://cdn/t1.jpg' },
            { id: 'm2', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://instagram.com/p/m2', timestamp: '2026-11-09T09:00:00+0000', like_count: 45, comments_count: 2, media_url: 'https://cdn/m2.jpg' },
          ],
        }),
      ],
    ]);
    const pulled = await pullInstagram({ externalId: '17841', handle: 'transsasco' });
    expect(pulled.account).toMatchObject({ followers: 2400, following: 120, postCount: 88, url: 'https://www.instagram.com/transsasco/' });
    expect(pulled.posts[0]).toMatchObject({ kind: 'reel', likes: 210, comments: 9, thumbnailUrl: 'https://cdn/t1.jpg' });
    expect(pulled.posts[1]).toMatchObject({ kind: 'post', title: 'Post without caption', thumbnailUrl: 'https://cdn/m2.jpg' });
  });

  it('reads a Facebook Page with its own page token, counting reactions as likes', async () => {
    const calls = stubFetch([
      [/\/555\?fields=access_token/, json({ access_token: 'page-token', id: '555' })],
      [/\/555\?fields=name/, json({ name: 'Trans-Sas', link: 'https://facebook.com/transsas', followers_count: 3100 })],
      [
        /\/555\/posts\?/,
        json({ data: [{ id: '555_1', message: 'Visit us in Accra', permalink_url: 'https://fb/1', created_time: '2026-11-08T08:00:00+0000', shares: { count: 4 }, reactions: { summary: { total_count: 77 } }, comments: { summary: { total_count: 5 } } }] }),
      ],
    ]);
    const pulled = await pullFacebook({ externalId: '555' });
    expect(calls[1]).toContain('access_token=page-token');
    expect(pulled.account.followers).toBe(3100);
    expect(pulled.posts[0]).toMatchObject({ likes: 77, comments: 5, shares: 4, title: 'Visit us in Accra' });
  });

  it('tells the user to renew an expired Meta token', async () => {
    stubFetch([[/graph\.facebook\.com/, json({ error: { code: 190, message: 'Session has expired' } }, 400)]]);
    await expect(pullInstagram({ externalId: '1', handle: 'a' })).rejects.toThrow(/expired or was revoked/);
  });
});

describe('recording figures', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it('updates the latest figures when the day is the newest', async () => {
    db.socialAccount.findUniqueOrThrow.mockResolvedValue({ figuresDay: day('2026-11-20') });
    await recordAccountFigures(db as never, 'a1', day('2026-11-25'), { followers: 500, following: null, postCount: 10, totalViews: null }, 'manual', 'u1');
    expect(db.socialAccountSnapshot.upsert).toHaveBeenCalledOnce();
    expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: expect.objectContaining({ followers: 500, figuresDay: day('2026-11-25') }) });
  });

  it('keeps today’s figures when an older day is filled in', async () => {
    db.socialAccount.findUniqueOrThrow.mockResolvedValue({ figuresDay: day('2026-11-25') });
    await recordAccountFigures(db as never, 'a1', day('2026-11-01'), { followers: 300, following: null, postCount: null, totalViews: null }, 'manual', 'u1');
    expect(db.socialAccountSnapshot.upsert).toHaveBeenCalledOnce();
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });
});

describe('social media access', () => {
  const SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
  const token = () =>
    new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-8000-000000000001')
      .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(SECRET);
  const asUser = (permissions: string[]) =>
    db.userProfile.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-0000000000aa',
      authUserId: '00000000-0000-4000-8000-000000000001',
      email: 'social@example.com',
      fullName: 'Social Worker',
      isActive: true,
      mustChangePassword: false,
      roles: [{ role: { permissions: permissions.map((permissionKey) => ({ permissionKey })) } }],
      branches: [],
    });

  it('keeps the tab closed to staff without social.read', async () => {
    asUser(['sales.read']);
    const res = await request(app).get('/api/v1/social/accounts').set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(403);
  });

  it('lets social.read view but not record figures', async () => {
    asUser(['social.read']);
    const res = await request(app)
      .post('/api/v1/social/accounts/00000000-0000-4000-8000-0000000000b1/figures')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ day: '2026-11-01', followers: 10 });
    expect(res.status).toBe(403);
  });

  it('refuses figures for a future day', async () => {
    asUser(['social.read', 'social.manage']);
    const res = await request(app)
      .post('/api/v1/social/accounts/00000000-0000-4000-8000-0000000000b1/figures')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ day: '2999-01-01', followers: 10 });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.day).toBeTruthy();
  });

  it('refuses an automatic Instagram account without the account id', async () => {
    asUser(['social.read', 'social.manage']);
    const res = await request(app)
      .post('/api/v1/social/accounts')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Idempotency-Key', 'abcdefgh12345678')
      .send({ platform: 'instagram', handle: '@TransSasCo', syncMode: 'automatic' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.externalId).toBeTruthy();
  });

  it('refuses automatic pulling for a platform with no free API', async () => {
    asUser(['social.read', 'social.manage']);
    const res = await request(app)
      .post('/api/v1/social/accounts')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Idempotency-Key', 'abcdefgh12345679')
      .send({ platform: 'tiktok', handle: 'transsas', syncMode: 'automatic' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.syncMode).toMatch(/can't be pulled automatically/);
  });
});
