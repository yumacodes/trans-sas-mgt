import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The public website routes: no session, a narrow CORS allowance, server-side pricing, and
 * a resent form returning the same reference. Prisma is mocked, as in http.test.ts.
 */
process.env.WEBSITE_ORIGINS = 'https://www.trans-sas.com';
process.env.CORS_ORIGINS = 'https://app.trans-sas.com';

const db = vi.hoisted(() => ({
  stockItem: { findMany: vi.fn(), findFirst: vi.fn() },
  proforma: { findUnique: vi.fn(), create: vi.fn() },
  companyProfile: { findFirst: vi.fn() },
  branch: { findFirst: vi.fn() },
  client: { findMany: vi.fn() },
  userProfile: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } }),
}));

const { createApp } = await import('../src/app');
const app = createApp();

const SITE = 'https://www.trans-sas.com';
const KEY = 'abcdefghijklmnop1234';

const item = (sku: string, price: string) => ({
  id: `00000000-0000-4000-8000-0000000000${sku.length}${price.length}`,
  sku,
  name: `Item ${sku}`,
  unit: 'unit',
  sellingPrice: new Prisma.Decimal(price),
});

const validBody = {
  submissionKey: KEY,
  name: 'Ama Mensah',
  organisation: 'Ridge Clinic',
  email: 'ama@example.com',
  phone: '024 000 0000',
  delivery: 'delivery',
  address: 'Ring Road, Accra',
  items: [
    { sku: 'couch-1', quantity: 2 },
    { sku: 'COUCH-1', quantity: 1 },
    { sku: 'LAMP', quantity: 1, unitPrice: '0.01' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.proforma.findUnique.mockResolvedValue(null);
  db.companyProfile.findFirst.mockResolvedValue({ defaultCurrency: 'GHS', settings: {} });
  db.branch.findFirst.mockResolvedValue({ id: '00000000-0000-4000-8000-0000000000b1' });
  db.client.findMany.mockResolvedValue([]);
  db.userProfile.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
  db.$queryRaw.mockResolvedValue([{ value: 7 }]);
  db.proforma.create.mockImplementation(async ({ data }: { data: { number: string } }) => ({ id: 'p1', number: data.number }));
});

describe('public website routes', () => {
  it('serves the catalogue without a session and lists only items marked for the website', async () => {
    db.stockItem.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/public/products').set('Origin', SITE);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(SITE);
    const where = db.stockItem.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ isActive: true, approvalStatus: 'approved', showOnWebsite: true });
  });

  it('never exposes prices or costs in the catalogue', async () => {
    db.stockItem.findMany.mockResolvedValue([
      { ...item('A', '10.00'), description: null, brand: null, model: null, category: null, images: [], purchaseCost: new Prisma.Decimal(5) },
    ]);
    const res = await request(app).get('/api/v1/public/products');
    expect(res.body.data[0]).not.toHaveProperty('sellingPrice');
    expect(res.body.data[0]).not.toHaveProperty('purchaseCost');
    expect(JSON.stringify(res.body)).not.toContain('10.00');
  });

  it('does not let the website origin call private routes', async () => {
    const res = await request(app).get('/api/v1/clients').set('Origin', SITE);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBe(401);
  });

  it('rejects an incomplete request with field messages', async () => {
    const res = await request(app)
      .post('/api/v1/public/requests')
      .send({ ...validBody, email: 'nope', delivery: 'delivery', address: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toHaveProperty('email');
    expect(res.body.error.fields).toHaveProperty('address');
    expect(db.proforma.create).not.toHaveBeenCalled();
  });

  it('turns a request into a draft website proforma priced on the server, and notifies staff', async () => {
    db.stockItem.findMany.mockResolvedValue([item('COUCH-1', '1500.00'), item('LAMP', '820.50')]);
    const res = await request(app).post('/api/v1/public/requests').set('Origin', SITE).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^PF-\d{4}-00007$/);

    const data = db.proforma.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ source: 'website', submissionKey: KEY, createdById: null, customerName: 'Ridge Clinic', currency: 'GHS' });
    // The two COUCH-1 lines merge; the browser's unitPrice is ignored.
    expect(data.items.create).toHaveLength(2);
    expect(data.items.create[0]).toMatchObject({ quantity: '3', unitPrice: '1500.00', amount: '4500.00' });
    expect(data.items.create[1]).toMatchObject({ quantity: '1', unitPrice: '820.50' });
    expect(data.total).toBe('5320.50');

    const notified = db.notification.createMany.mock.calls[0]![0].data;
    expect(notified).toHaveLength(2);
    expect(notified[0]).toMatchObject({ type: 'website_request', link: '/website-requests?open=p1' });
  });

  it('refuses products that are not listed on the website', async () => {
    db.stockItem.findMany.mockResolvedValue([item('COUCH-1', '1500.00')]);
    const res = await request(app).post('/api/v1/public/requests').send(validBody);
    expect(res.status).toBe(422);
    expect(db.proforma.create).not.toHaveBeenCalled();
  });

  it('returns the original reference when the same form is sent again', async () => {
    db.proforma.findUnique.mockResolvedValue({ number: 'PF-2026-00003' });
    const res = await request(app).post('/api/v1/public/requests').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.reference).toBe('PF-2026-00003');
    expect(db.proforma.create).not.toHaveBeenCalled();
  });

  it('refuses a submission that filled in the hidden honeypot field', async () => {
    const res = await request(app).post('/api/v1/public/requests').send({ ...validBody, website: 'http://spam' });
    expect(res.status).toBe(400);
    expect(db.proforma.create).not.toHaveBeenCalled();
  });

  it("records the buyer's tender / PO reference and TIN on the draft", async () => {
    db.stockItem.findMany.mockResolvedValue([item('COUCH-1', '1500.00'), item('LAMP', '820.50')]);
    const res = await request(app)
      .post('/api/v1/public/requests')
      .send({ ...validBody, reference: 'LPO-118', taxId: 'C0001234567' });
    expect(res.status).toBe(201);
    const notes = db.proforma.create.mock.calls[0]![0].data.notes as string;
    expect(notes).toContain('LPO-118');
    expect(notes).toContain('C0001234567');
  });
});

describe('public contact enquiries', () => {
  const enquiry = {
    submissionKey: KEY,
    name: 'Kofi Boateng',
    email: 'kofi@example.com',
    topic: 'sourcing',
    subject: 'Ultrasound gel',
    message: 'Do you stock 5 L ultrasound gel?',
  };

  it('notifies staff with the whole message and returns a reference', async () => {
    const res = await request(app).post('/api/v1/public/enquiries').set('Origin', SITE).send(enquiry);
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^ENQ-[A-Z0-9]{6}$/);
    const notified = db.notification.createMany.mock.calls[0]![0].data;
    expect(notified).toHaveLength(2);
    expect(notified[0]).toMatchObject({ type: 'website_enquiry' });
    expect(notified[0].body).toContain('Do you stock 5 L ultrasound gel?');
    expect(notified[0].dedupeKey).toBe(`website-enquiry:${res.body.data.reference}`);
  });

  it('gives a resent message the same reference', async () => {
    const a = await request(app).post('/api/v1/public/enquiries').send(enquiry);
    const b = await request(app).post('/api/v1/public/enquiries').send(enquiry);
    expect(a.body.data.reference).toBe(b.body.data.reference);
  });

  it('rejects a message without the required fields', async () => {
    const res = await request(app).post('/api/v1/public/enquiries').send({ ...enquiry, message: '', email: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toHaveProperty('message');
    expect(res.body.error.fields).toHaveProperty('email');
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('refuses the honeypot', async () => {
    const res = await request(app).post('/api/v1/public/enquiries').send({ ...enquiry, website: 'x' });
    expect(res.status).toBe(400);
  });
});
