import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token-123' } } }) },
  },
}));

const { ApiError, NETWORK_ERROR_MESSAGE, buildQuery, onAuthFailure, parseErrorResponse, request } =
  await import('./api');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseErrorResponse', () => {
  it('reads the API error envelope', async () => {
    const err = await parseErrorResponse(
      json(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Some required information is missing.',
          fields: { name: 'Client name is required.' },
          requestId: 'req-1',
        },
      }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fields).toEqual({ name: 'Client name is required.' });
    expect(err.requestId).toBe('req-1');
  });

  it('falls back to a friendly message when the body is not JSON', async () => {
    const err = await parseErrorResponse(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toMatch(/something went wrong/i);
    expect(err.message).not.toMatch(/html/i);
    expect(err.retryable).toBe(true);
  });

  it('infers permission errors from the status', async () => {
    const err = await parseErrorResponse(new Response('', { status: 403 }));
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toMatch(/don't have permission/i);
  });
});

describe('request', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('sends the bearer token, JSON body and idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { data: { id: 'c1' } }));
    const result = await request('POST', '/clients', { body: { name: 'A' }, idempotencyKey: 'k-1' });
    expect(result.data).toEqual({ id: 'c1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/clients');
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(init.headers['Idempotency-Key']).toBe('k-1');
    expect(init.body).toBe('{"name":"A"}');
  });

  it('maps network failures to the connection message', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(request('GET', '/clients')).rejects.toMatchObject({
      code: 'NETWORK',
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('notifies listeners when the session is rejected', async () => {
    const listener = vi.fn();
    const off = onAuthFailure(listener);
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'SESSION_INVALID', message: 'Expired' } }));
    await expect(request('GET', '/me')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_INVALID' }));
    off();
  });

  it('does not treat permission errors as session failures', async () => {
    const listener = vi.fn();
    const off = onAuthFailure(listener);
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: 'FORBIDDEN', message: 'No' } }));
    await expect(request('GET', '/users')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});

describe('buildQuery', () => {
  it('omits empty values', () => {
    expect(buildQuery({ page: 2, q: '', status: undefined, lowStock: true })).toBe('?page=2&lowStock=true');
    expect(buildQuery({})).toBe('');
  });
});
