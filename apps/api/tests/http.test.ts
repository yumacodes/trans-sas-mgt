import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HTTP-level tests of authentication, authorisation and validation. Prisma is mocked,
 * so these run without a database; tests/integration covers real database behaviour.
 */
const db = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  passwordResetRequest: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  branch: { findMany: vi.fn(), count: vi.fn() },
  message: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  messageRecipient: { findMany: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  client: { findMany: vi.fn() },
  companyProfile: { findFirst: vi.fn() },
  stockItemImage: { findMany: vi.fn(), aggregate: vi.fn() },
  idempotencyRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));

const supabaseAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: supabaseAuth }) }));

const { createApp } = await import('../src/app');
const app = createApp();

const SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
const ISSUER = `${process.env.SUPABASE_URL}/auth/v1`;

async function token(opts: { sub?: string; expiresIn?: string; issuer?: string; secret?: Uint8Array } = {}) {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.sub ?? '00000000-0000-4000-8000-000000000001')
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(opts.secret ?? SECRET);
}

function profile(permissionKeys: string[], over: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    authUserId: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    fullName: 'Test User',
    isActive: true,
    roles: [{ role: { permissions: permissionKeys.map((permissionKey) => ({ permissionKey })) } }],
    branches: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Run transaction callbacks against the same mock client.
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
});

describe('authentication', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/v1/branches/options');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('rejects tokens signed with another key', async () => {
    const bad = await token({ secret: new TextEncoder().encode('another-secret-that-is-long-enough-123') });
    const res = await request(app).get('/api/v1/branches/options').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_INVALID');
  });

  it('rejects expired tokens with a sign-in-again message', async () => {
    const expired = await token({ expiresIn: '-1m' });
    const res = await request(app).get('/api/v1/branches/options').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it('rejects tokens from another issuer', async () => {
    const foreign = await token({ issuer: 'https://evil.example/auth/v1' });
    const res = await request(app).get('/api/v1/branches/options').set('Authorization', `Bearer ${foreign}`);
    expect(res.status).toBe(401);
  });

  it('blocks deactivated accounts even with a valid token', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['branches.read'], { isActive: false }));
    const res = await request(app)
      .get('/api/v1/branches/options')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('blocks auth users without an application profile', async () => {
    db.userProfile.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/branches/options')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('authorisation', () => {
  it('limits branch options to assigned branches for scoped users', async () => {
    db.userProfile.findUnique.mockResolvedValue(
      profile(['branches.read'], { branches: [{ branchId: '00000000-0000-4000-8000-0000000000b1' }] }),
    );
    db.branch.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/branches/options')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(200);
    expect(db.branch.findMany.mock.calls[0]![0].where).toEqual({
      isActive: true,
      id: { in: ['00000000-0000-4000-8000-0000000000b1'] },
    });
  });

  it.each([
    ['get', '/api/v1/users'],
    ['post', '/api/v1/users'],
    ['get', '/api/v1/roles'],
    ['put', '/api/v1/company'],
    ['post', '/api/v1/branches'],
    ['get', '/api/v1/audit-logs'],
    ['post', '/api/v1/stock-items'],
    ['get', '/api/v1/stock-balances'],
    ['get', '/api/v1/messages'],
    ['post', '/api/v1/messages'],
    ['post', '/api/v1/messages/audience'],
  ] as const)('denies %s %s to a support-style user', async (method, path) => {
    db.userProfile.findUnique.mockResolvedValue(profile(['clients.read', 'stock_items.read']));
    const res = await request(app)[method](path).set('Authorization', `Bearer ${await token()}`).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toMatch(/permission/);
  });

  it('prevents users from changing their own roles', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['users.manage']));
    const res = await request(app)
      .put('/api/v1/users/00000000-0000-4000-8000-0000000000aa/access')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ roleIds: ['00000000-0000-4000-8000-0000000000cc'], branchIds: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/own roles/);
  });

  it('prevents users from deactivating themselves', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['users.manage']));
    const res = await request(app)
      .patch('/api/v1/users/00000000-0000-4000-8000-0000000000aa/status')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });
});

describe('validation and request handling', () => {
  it('returns field errors for invalid input', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['branches.manage']));
    const res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ code: 'bad code!', name: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['code', 'name']));
  });

  it('requires an idempotency key for critical creates', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['clients.read', 'clients.create']));
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ name: 'Ridge Hospital', organizationType: 'public_hospital' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Idempotency-Key/);
  });

  it('replays the stored response when a key is reused with the same body', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['clients.read', 'clients.create']));
    const { Prisma } = await import('@prisma/client');
    db.idempotencyRecord.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    const body = { name: 'Ridge Hospital', organizationType: 'public_hospital' };
    const { createHash } = await import('node:crypto');
    const { stableStringify } = await import('../src/middleware/idempotency');
    db.idempotencyRecord.findUnique.mockResolvedValue({
      method: 'POST',
      path: '/api/v1/clients/',
      requestHash: createHash('sha256').update(stableStringify(body)).digest('hex'),
      completedAt: new Date(),
      statusCode: 201,
      responseBody: { data: { id: 'existing-client' } },
      createdAt: new Date(),
    });
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Idempotency-Key', 'key-12345678')
      .send(body);
    expect(res.status).toBe(201);
    expect(res.headers['idempotent-replayed']).toBe('true');
    expect(res.body.data.id).toBe('existing-client');
  });

  it('rejects a reused key with different data', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['clients.read', 'clients.create']));
    const { Prisma } = await import('@prisma/client');
    db.idempotencyRecord.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    db.idempotencyRecord.findUnique.mockResolvedValue({
      method: 'POST',
      path: '/api/v1/clients/',
      requestHash: 'different',
      completedAt: new Date(),
      statusCode: 201,
      responseBody: {},
      createdAt: new Date(),
    });
    const res = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Idempotency-Key', 'key-12345678')
      .send({ name: 'Other', organizationType: 'clinic' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects malformed JSON safely', async () => {
    const res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Content-Type', 'application/json')
      .send('{"code":');
    expect(res.status).toBe(400);
    expect(res.body.error.message).not.toMatch(/at |stack|SyntaxError/);
  });

  it('hides internal errors behind a safe message', async () => {
    db.userProfile.findUnique.mockRejectedValue(new Error('connection to 10.0.0.5 refused'));
    const res = await request(app)
      .get('/api/v1/branches/options')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('returns 404 in the standard error shape for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('communication', () => {
  const sender = () => profile(['messages.read', 'messages.send']);

  /** A fresh idempotency key: earlier tests leave their own mock implementations behind. */
  const freshKey = () => {
    db.idempotencyRecord.create.mockResolvedValue({ id: '00000000-0000-4000-8000-0000000000f1' });
    db.idempotencyRecord.findUnique.mockResolvedValue(null);
    db.idempotencyRecord.update.mockResolvedValue({});
    db.idempotencyRecord.delete.mockResolvedValue({});
  };

  it('reports that email has not been configured instead of pretending to send', async () => {
    db.userProfile.findUnique.mockResolvedValue(sender());
    const res = await request(app)
      .get('/api/v1/messages/email-config')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.missing).toEqual(['SMTP_HOST', 'MAIL_FROM_EMAIL']);
    expect(res.body.data.fromAddress).toBeNull();
  });

  it('refuses to send while no mail server is configured', async () => {
    db.userProfile.findUnique.mockResolvedValue(sender());
    freshKey();
    const res = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Idempotency-Key', 'send-attempt-0001')
      .send({ audience: 'clients', subject: 'Hello', body: 'Dear {{first_name}}' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/Email has not been set up/);
    // Nothing may be recorded when the message cannot be delivered.
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it('rejects a merge field the audience cannot fill, before any delivery', async () => {
    db.userProfile.findUnique.mockResolvedValue(sender());
    freshKey();
    const res = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${await token()}`)
      .set('Idempotency-Key', 'send-attempt-0002')
      .send({ audience: 'users', subject: 'Hi', body: 'Dear {{client_code}}' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.body).toMatch(/client_code/);
  });

  it('limits a branch-scoped sender to the clients of their own branches', async () => {
    db.userProfile.findUnique.mockResolvedValue(
      profile(['messages.send'], { branches: [{ branchId: '00000000-0000-4000-8000-0000000000b1' }] }),
    );
    db.companyProfile.findFirst.mockResolvedValue({ name: 'Trans SAS' });
    db.client.findMany.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/v1/messages/audience')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ audience: 'clients' });
    expect(res.status).toBe(200);
    expect(db.client.findMany.mock.calls[0]![0].where).toMatchObject({
      OR: [{ branchId: null }, { branchId: { in: ['00000000-0000-4000-8000-0000000000b1'] } }],
      status: 'active',
    });
  });

  it('treats an empty recipient list as nobody, not everybody', async () => {
    db.userProfile.findUnique.mockResolvedValue(sender());
    db.companyProfile.findFirst.mockResolvedValue({ name: 'Trans SAS' });
    db.client.findMany.mockResolvedValue([{ id: 'c1', name: 'Ridge', email: 'r@example.com' }]);
    const res = await request(app)
      .post('/api/v1/messages/audience')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ audience: 'clients', recipientIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it('refuses an audience filtered to a branch the sender cannot see', async () => {
    db.userProfile.findUnique.mockResolvedValue(
      profile(['messages.send'], { branches: [{ branchId: '00000000-0000-4000-8000-0000000000b1' }] }),
    );
    const res = await request(app)
      .post('/api/v1/messages/audience')
      .set('Authorization', `Bearer ${await token()}`)
      .send({ audience: 'clients', filters: { branchId: '00000000-0000-4000-8000-0000000000b9' } });
    expect(res.status).toBe(403);
  });
});

describe('stock item images', () => {
  it('lets a catalogue reader see images but not add them', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['stock_items.read']));
    const res = await request(app)
      .post('/api/v1/stock-items/00000000-0000-4000-8000-0000000000e1/images')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(403);
    expect(db.stockItemImage.aggregate).not.toHaveBeenCalled();
  });

  it('refuses to remove an image without the update permission', async () => {
    db.userProfile.findUnique.mockResolvedValue(profile(['stock_items.read', 'stock_items.create']));
    const res = await request(app)
      .delete('/api/v1/stock-items/00000000-0000-4000-8000-0000000000e1/images/00000000-0000-4000-8000-0000000000e2')
      .set('Authorization', `Bearer ${await token()}`);
    expect(res.status).toBe(403);
  });
});

describe('sign-in with username or email', () => {
  const login = (identifier: string, password = 'correct-horse-1') =>
    request(app).post('/api/v1/auth/login').send({ identifier, password });

  it('resolves a username to its email and returns the Supabase session', async () => {
    db.userProfile.findUnique.mockResolvedValue({ email: 'dev@example.com', isActive: true });
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'access', refresh_token: 'refresh' } },
      error: null,
    });
    const res = await login('  DEV ');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(db.userProfile.findUnique.mock.calls[0]![0].where).toEqual({ username: 'dev' });
    expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'dev@example.com',
      password: 'correct-horse-1',
    });
  });

  it('looks up email identifiers by email', async () => {
    db.userProfile.findUnique.mockResolvedValue({ email: 'dev@example.com', isActive: true });
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'a', refresh_token: 'r' } },
      error: null,
    });
    await login('Dev@Example.com');
    expect(db.userProfile.findUnique.mock.calls[0]![0].where).toEqual({ email: 'dev@example.com' });
  });

  it('answers an unknown username exactly like a wrong password', async () => {
    db.userProfile.findUnique.mockResolvedValueOnce(null);
    const unknown = await login('nobody');
    expect(supabaseAuth.signInWithPassword).not.toHaveBeenCalled();

    db.userProfile.findUnique.mockResolvedValueOnce({ email: 'dev@example.com', isActive: true });
    supabaseAuth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 },
    });
    const wrong = await login('dev', 'wrong-password');

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('reports banned (deactivated) accounts', async () => {
    db.userProfile.findUnique.mockResolvedValue({ email: 'dev@example.com', isActive: false });
    supabaseAuth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'user_banned', message: 'User is banned', status: 400 },
    });
    const res = await login('dev');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('validates the sign-in form on the server', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: '', password: '' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['identifier', 'password']));
  });

  it('records a reset request for the admin without revealing whether the account exists', async () => {
    db.userProfile.findFirst.mockResolvedValueOnce(null);
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com', username: 'ghost' });
    expect(db.passwordResetRequest.create).not.toHaveBeenCalled();

    db.userProfile.findFirst.mockResolvedValueOnce({ id: 'u1', fullName: 'Dev', email: 'dev@example.com' });
    db.passwordResetRequest.findFirst.mockResolvedValueOnce(null);
    db.passwordResetRequest.create.mockResolvedValueOnce({ id: 'r1' });
    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'dev@example.com', username: 'dev' });

    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(db.passwordResetRequest.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'user.password_reset_requested' }) }),
    );
  });
});
