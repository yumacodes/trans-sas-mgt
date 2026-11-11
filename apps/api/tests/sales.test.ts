import { Prisma } from '@prisma/client';
import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The rules that keep stock and money right: stock moves exactly once, and payments can't
 * exceed what is owed. Prisma and the stock ledger are mocked, so these run without a
 * database; concurrency itself relies on the row locks and needs a real one to exercise.
 */
const db = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn(), findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
  idempotencyRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  sale: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  waybill: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  waybillItem: { findMany: vi.fn() },
  payment: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  stockItem: { findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
const recordMovement = vi.hoisted(() => vi.fn());
vi.mock('../src/services/inventory', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../src/services/inventory')),
  recordMovement,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {} }) }));

const { createApp } = await import('../src/app');
const app = createApp();

const SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
const ID = '00000000-0000-4000-8000-0000000000f1';
const SALE = '00000000-0000-4000-8000-0000000000f2';
const LINE = '00000000-0000-4000-8000-0000000000f3';
const ITEM = '00000000-0000-4000-8000-0000000000f4';
const BRANCH = '00000000-0000-4000-8000-0000000000b1';

async function auth() {
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('00000000-0000-4000-8000-000000000001')
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(SECRET);
  return `Bearer ${token}`;
}

function signIn(keys: string[]) {
  db.userProfile.findUnique.mockResolvedValue({
    id: '00000000-0000-4000-8000-0000000000aa',
    authUserId: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    fullName: 'Test User',
    isActive: true,
    roles: [{ role: { permissions: [...keys, 'branches.all_access'].map((permissionKey) => ({ permissionKey })) } }],
    branches: [],
  });
}

const money = (v: string) => new Prisma.Decimal(v);
const line = { id: LINE, position: 0, stockItemId: ITEM, name: 'Monitor', quantity: money('2'), unit: 'unit', unitPrice: money('10.00'), amount: money('20.00') };
const sale = (over: Record<string, unknown> = {}) => ({
  id: ID,
  number: 'S-1',
  branchId: BRANCH,
  status: 'draft',
  saleDate: new Date('2026-11-11'),
  dueDate: null,
  currency: 'GHS',
  taxRate: money('0'),
  subtotal: money('20.00'),
  taxAmount: money('0.00'),
  total: money('20.00'),
  items: [line],
  payments: [],
  createdBy: { fullName: 'x' },
  branch: null,
  proforma: null,
  tender: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const waybill = (over: Record<string, unknown> = {}) => ({
  id: ID,
  number: 'W-1',
  branchId: BRANCH,
  saleId: null,
  sale: null,
  status: 'draft',
  stockIssued: false,
  deliveryDate: new Date('2026-11-11'),
  items: [{ ...line, saleItemId: null }],
  createdBy: { fullName: 'x' },
  branch: null,
  dispatchedAt: null,
  deliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.stockItem.findMany.mockResolvedValue([{ id: ITEM, name: 'Monitor', isActive: true, purchaseCost: null }]);
  db.sale.updateMany.mockResolvedValue({ count: 1 });
  db.waybill.updateMany.mockResolvedValue({ count: 1 });
  db.idempotencyRecord.create.mockResolvedValue({ id: 'record' });
  db.userProfile.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
  db.idempotencyRecord.delete.mockResolvedValue({});
  db.idempotencyRecord.update.mockResolvedValue({});
});

describe('sale stock rules', () => {
  it('issues stock when a draft is confirmed', async () => {
    signIn(['sales.read', 'sales.manage']);
    db.sale.findUnique.mockResolvedValue(sale());
    const res = await request(app).post(`/api/v1/sales/${ID}/confirm`).set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(recordMovement).toHaveBeenCalledTimes(1);
    expect(recordMovement.mock.calls[0]![1]).toMatchObject({ type: 'sale_issue', itemId: ITEM, branchId: BRANCH });
  });

  it('does not issue stock again when confirm is retried', async () => {
    signIn(['sales.read', 'sales.manage']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed' }));
    const res = await request(app).post(`/api/v1/sales/${ID}/confirm`).set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('does not issue stock when another request confirmed it first', async () => {
    signIn(['sales.read', 'sales.manage']);
    db.sale.findUnique.mockResolvedValue(sale());
    db.sale.updateMany.mockResolvedValue({ count: 0 });
    await request(app).post(`/api/v1/sales/${ID}/confirm`).set('Authorization', await auth());
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('leaves lines with no stock item out of the stock ledger', async () => {
    signIn(['sales.read', 'sales.manage']);
    db.sale.findUnique.mockResolvedValue(sale({ items: [{ ...line, stockItemId: null }] }));
    await request(app).post(`/api/v1/sales/${ID}/confirm`).set('Authorization', await auth());
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('returns stock when a confirmed sale is cancelled', async () => {
    signIn(['sales.read', 'sales.cancel']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed' }));
    db.waybill.count.mockResolvedValue(0);
    const res = await request(app).post(`/api/v1/sales/${ID}/cancel`).set('Authorization', await auth()).send({ reason: 'Client withdrew' });
    expect(res.status).toBe(200);
    expect(recordMovement.mock.calls[0]![1]).toMatchObject({ type: 'sale_return' });
  });

  it('moves no stock when a draft is cancelled', async () => {
    signIn(['sales.read', 'sales.cancel']);
    db.sale.findUnique.mockResolvedValue(sale());
    db.waybill.count.mockResolvedValue(0);
    await request(app).post(`/api/v1/sales/${ID}/cancel`).set('Authorization', await auth()).send({ reason: 'Not needed' });
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('refuses to cancel a sale that has payments', async () => {
    signIn(['sales.read', 'sales.cancel']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed', payments: [{ amount: money('5.00') }] }));
    const res = await request(app).post(`/api/v1/sales/${ID}/cancel`).set('Authorization', await auth()).send({ reason: 'x' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(recordMovement).not.toHaveBeenCalled();
    expect(db.sale.updateMany).not.toHaveBeenCalled();
  });

  it('blocks confirming without the permission', async () => {
    signIn(['sales.read']);
    const res = await request(app).post(`/api/v1/sales/${ID}/confirm`).set('Authorization', await auth());
    expect(res.status).toBe(403);
    expect(recordMovement).not.toHaveBeenCalled();
  });
});

describe('waybill stock rules', () => {
  it('moves no stock when dispatching a waybill linked to a sale', async () => {
    signIn(['waybills.read', 'waybills.manage']);
    db.waybill.findUnique.mockResolvedValue(waybill({ saleId: SALE, sale: { id: SALE, number: 'S-1' } }));
    const res = await request(app).post(`/api/v1/waybills/${ID}/dispatch`).set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(recordMovement).not.toHaveBeenCalled();
    expect(db.waybill.updateMany.mock.calls[0]![0].data.stockIssued).toBe(false);
  });

  it('issues stock at dispatch when there is no sale', async () => {
    signIn(['waybills.read', 'waybills.manage']);
    db.waybill.findUnique.mockResolvedValue(waybill());
    await request(app).post(`/api/v1/waybills/${ID}/dispatch`).set('Authorization', await auth());
    expect(recordMovement).toHaveBeenCalledTimes(1);
    expect(recordMovement.mock.calls[0]![1]).toMatchObject({ type: 'sale_issue', sourceType: 'waybill' });
  });

  it('does not issue stock again when dispatch is retried', async () => {
    signIn(['waybills.read', 'waybills.manage']);
    db.waybill.findUnique.mockResolvedValue(waybill({ status: 'dispatched', stockIssued: true }));
    await request(app).post(`/api/v1/waybills/${ID}/dispatch`).set('Authorization', await auth());
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('moves no stock on delivery', async () => {
    signIn(['waybills.read', 'waybills.manage']);
    db.waybill.findUnique.mockResolvedValue(waybill({ status: 'dispatched', stockIssued: true }));
    await request(app).post(`/api/v1/waybills/${ID}/deliver`).set('Authorization', await auth()).send({ receivedBy: 'Ama' });
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('returns stock only if the waybill itself issued it', async () => {
    signIn(['waybills.read', 'waybills.manage']);
    db.waybill.findUnique.mockResolvedValue(waybill({ status: 'dispatched', stockIssued: true }));
    await request(app).post(`/api/v1/waybills/${ID}/cancel`).set('Authorization', await auth());
    expect(recordMovement.mock.calls[0]![1]).toMatchObject({ type: 'sale_return' });

    recordMovement.mockClear();
    db.waybill.findUnique.mockResolvedValue(waybill({ status: 'dispatched', saleId: SALE, sale: { id: SALE, number: 'S-1' } }));
    await request(app).post(`/api/v1/waybills/${ID}/cancel`).set('Authorization', await auth());
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('refuses to deliver more than is left on the sale', async () => {
    signIn(['waybills.read', 'waybills.manage']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed' }));
    db.waybillItem.findMany.mockResolvedValue([{ saleItemId: LINE, quantity: money('1') }]);
    db.stockItem.count.mockResolvedValue(1);
    const res = await request(app)
      .post('/api/v1/waybills')
      .set('Authorization', await auth())
      .set('Idempotency-Key', '00000000-0000-4000-8000-00000000abc1')
      .send({
        saleId: ID,
        recipientName: 'Client',
        deliveryDate: '2026-11-11',
        items: [{ saleItemId: LINE, stockItemId: ITEM, name: 'Monitor', quantity: '2', unit: 'unit' }],
      });
    expect(res.status).toBe(422);
    expect(db.waybill.create).not.toHaveBeenCalled();
  });
});

describe('payment rules', () => {
  const body = { saleId: ID, paymentDate: '2026-11-11', amount: '15.00', method: 'cash' };
  const post = async (payload: Record<string, unknown>, key: string) =>
    request(app)
      .post('/api/v1/payments')
      .set('Authorization', await auth())
      .set('Idempotency-Key', key)
      .send(payload);

  it('rejects a payment larger than the balance', async () => {
    signIn(['payments.read', 'payments.record']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed', payments: [{ amount: money('10.00') }] }));
    const res = await post(body, '00000000-0000-4000-8000-00000000abc2');
    expect(res.status).toBe(422);
    expect(res.body.error.fields.amount).toMatch(/outstanding balance/);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a payment against a sale that is not confirmed', async () => {
    signIn(['payments.read', 'payments.record']);
    db.sale.findUnique.mockResolvedValue(sale());
    const res = await post(body, '00000000-0000-4000-8000-00000000abc3');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate external reference', async () => {
    signIn(['payments.read', 'payments.record']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed' }));
    db.payment.count.mockResolvedValue(1);
    const res = await post({ ...body, externalReference: 'BANK-1' }, '00000000-0000-4000-8000-00000000abc4');
    expect(res.status).toBe(422);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a zero amount', async () => {
    signIn(['payments.read', 'payments.record']);
    const res = await post({ ...body, amount: '0' }, '00000000-0000-4000-8000-00000000abc5');
    expect(res.status).toBe(422);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('locks the sale before reading its balance', async () => {
    signIn(['payments.read', 'payments.record']);
    db.sale.findUnique.mockResolvedValue(sale({ status: 'confirmed', payments: [{ amount: money('10.00') }] }));
    await post(body, '00000000-0000-4000-8000-00000000abc6');
    expect(db.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(db.sale.findUnique.mock.invocationCallOrder.at(-1)!);
    expect(db.$queryRaw.mock.calls[0]![0].join(' ')).toContain('FOR UPDATE');
  });
});

describe('stock item approval', () => {
  const stock = { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() };

  beforeEach(() => {
    Object.assign(db.stockItem, stock);
    stock.findUnique.mockResolvedValue({ id: ID, sku: 'A-1', name: 'Monitor', createdById: 'someone' });
  });

  it('blocks approving without the permission', async () => {
    signIn(['stock_items.read']);
    const res = await request(app).post(`/api/v1/stock-items/${ID}/approve`).set('Authorization', await auth());
    expect(res.status).toBe(403);
    expect(stock.updateMany).not.toHaveBeenCalled();
  });

  it('will not decide an item twice', async () => {
    signIn(['stock_items.read', 'stock_items.approve']);
    stock.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post(`/api/v1/stock-items/${ID}/approve`).set('Authorization', await auth());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('needs a reason to reject', async () => {
    signIn(['stock_items.read', 'stock_items.approve']);
    const res = await request(app).post(`/api/v1/stock-items/${ID}/reject`).set('Authorization', await auth()).send({ reason: '' });
    expect(res.status).toBe(422);
    expect(stock.updateMany).not.toHaveBeenCalled();
  });
});

describe('purchase receipts', () => {
  const purchaseRow = (over: Record<string, unknown> = {}) => ({
    id: ID,
    number: 'PO-1',
    branchId: BRANCH,
    status: 'ordered',
    items: [{ id: LINE, stockItemId: ITEM, name: 'Monitor', unit: 'unit', quantity: money('5'), receivedQuantity: money('2'), unitCost: money('10') }],
    supplier: { id: SALE, code: 'SUP-1', name: 'Supplier' },
    receipts: [],
    ...over,
  });
  const purchase = { findUnique: vi.fn(), update: vi.fn() };
  const goodsReceipt = { create: vi.fn() };
  const purchaseItem = { update: vi.fn() };

  beforeEach(() => {
    Object.assign(db, { purchase, goodsReceipt, purchaseItem });
    goodsReceipt.create.mockResolvedValue({ id: 'receipt' });
  });

  const receive = async (qty: string, key: string) =>
    request(app)
      .post(`/api/v1/purchases/${ID}/receive`)
      .set('Authorization', await auth())
      .set('Idempotency-Key', key)
      .send({ receivedDate: '2026-11-11', items: [{ purchaseItemId: LINE, quantity: qty }] });

  it('adds received goods to stock and marks a partial receipt', async () => {
    signIn(['purchases.read', 'purchases.receive']);
    purchase.findUnique.mockResolvedValue(purchaseRow());
    await receive('1', '00000000-0000-4000-8000-00000000bbb1');
    expect(recordMovement).toHaveBeenCalledTimes(1);
    expect(recordMovement.mock.calls[0]![1]).toMatchObject({ type: 'purchase_receipt', itemId: ITEM, branchId: BRANCH });
    expect(purchase.update.mock.calls[0]![0].data.status).toBe('partially_received');
  });

  it('marks the purchase received once everything has arrived', async () => {
    signIn(['purchases.read', 'purchases.receive']);
    purchase.findUnique.mockResolvedValue(purchaseRow());
    await receive('3', '00000000-0000-4000-8000-00000000bbb2');
    expect(purchase.update.mock.calls[0]![0].data.status).toBe('received');
  });

  it('refuses to receive more than is still due', async () => {
    signIn(['purchases.read', 'purchases.receive']);
    purchase.findUnique.mockResolvedValue(purchaseRow());
    const res = await receive('4', '00000000-0000-4000-8000-00000000bbb3');
    expect(res.status).toBe(422);
    expect(recordMovement).not.toHaveBeenCalled();
    expect(goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('does not change stock for a draft purchase', async () => {
    signIn(['purchases.read', 'purchases.receive']);
    purchase.findUnique.mockResolvedValue(purchaseRow({ status: 'draft' }));
    const res = await receive('1', '00000000-0000-4000-8000-00000000bbb4');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('blocks receiving without the permission', async () => {
    signIn(['purchases.read']);
    const res = await receive('1', '00000000-0000-4000-8000-00000000bbb5');
    expect(res.status).toBe(403);
    expect(recordMovement).not.toHaveBeenCalled();
  });
});

describe('scheduled jobs endpoint', () => {
  it('is unavailable until a secret is configured, and never runs for a user session', async () => {
    const res = await request(app).get('/api/v1/jobs/daily').set('Authorization', await auth());
    expect([401, 503]).toContain(res.status);
  });
});

describe('spreadsheet import', () => {
  const stockCategory = { findMany: vi.fn() };
  const createMany = vi.fn();

  beforeEach(() => {
    Object.assign(db, { stockCategory });
    Object.assign(db.stockItem, { createMany });
    stockCategory.findMany.mockResolvedValue([{ id: BRANCH, name: 'Monitors' }]);
    db.stockItem.findMany.mockResolvedValue([{ sku: 'OLD-1' }]);
  });

  const rows = [
    { sku: 'new-1', name: 'Monitor', sellingPrice: '10', category: 'Monitors' },
    { sku: 'OLD-1', name: 'Already there', sellingPrice: '5' },
    { sku: 'new-1', name: 'Twice in file', sellingPrice: '5' },
    { sku: 'bad sku!', name: 'Bad', sellingPrice: '5' },
    { sku: 'NEW-2', name: 'Unknown category', sellingPrice: '5', category: 'Nope' },
  ];

  it('checks every row without saving anything', async () => {
    signIn(['stock_items.read', 'stock_items.create']);
    const res = await request(app).post('/api/v1/imports/stock-items').set('Authorization', await auth()).send({ rows });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ committed: false, valid: 1, duplicates: 2, invalid: 2 });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('saves only the valid rows', async () => {
    signIn(['stock_items.read', 'stock_items.create']);
    const res = await request(app).post('/api/v1/imports/stock-items').set('Authorization', await auth()).send({ rows, commit: true });
    expect(res.body.data.created).toBe(1);
    expect(createMany.mock.calls[0]![0].data).toHaveLength(1);
    expect(createMany.mock.calls[0]![0].data[0]).toMatchObject({ sku: 'NEW-1', approvalStatus: 'pending', categoryId: BRANCH });
  });

  it('blocks importing without the permission', async () => {
    signIn(['stock_items.read']);
    const res = await request(app).post('/api/v1/imports/stock-items').set('Authorization', await auth()).send({ rows });
    expect(res.status).toBe(403);
  });
});

describe('reports', () => {
  it('keeps financial reports from users with only operational report access', async () => {
    signIn(['reports.view']);
    const res = await request(app).get('/api/v1/reports/income-statement').set('Authorization', await auth());
    expect(res.status).toBe(403);
  });

  it('rejects an unknown report', async () => {
    signIn(['reports.view', 'reports.financial']);
    const res = await request(app).get('/api/v1/reports/salaries').set('Authorization', await auth());
    expect(res.status).toBe(422);
  });
});

describe('expense approval limit', () => {
  const expense = { findUnique: vi.fn(), updateMany: vi.fn() };
  const companyProfile = { findFirst: vi.fn() };

  beforeEach(() => {
    Object.assign(db, { expense, companyProfile });
    companyProfile.findFirst.mockResolvedValue({ settings: { expenseApprovalLimit: '1000' } });
    expense.findUnique.mockResolvedValue({ id: ID, number: 'EX-1', kind: 'general', status: 'pending', amount: money('5000'), branchId: null });
  });

  const approve = async () =>
    request(app).post(`/api/v1/expenses/${ID}/status`).set('Authorization', await auth()).send({ status: 'approved' });

  it('stops an ordinary approver approving above the limit', async () => {
    signIn(['expenses.read', 'expenses.approve']);
    const res = await approve();
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/approval limit/);
    expect(expense.updateMany).not.toHaveBeenCalled();
  });

  it('lets someone with the large-approval permission approve it', async () => {
    signIn(['expenses.read', 'expenses.approve', 'expenses.approve_large']);
    expense.updateMany.mockResolvedValue({ count: 1 });
    await approve();
    expect(expense.updateMany).toHaveBeenCalled();
  });
});
