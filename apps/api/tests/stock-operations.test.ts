import { Prisma } from '@prisma/client';
import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stock adjustments and branch transfers. Prisma is mocked with a small in-memory balance
 * table, while the real stock ledger code (recordMovement) runs, so shortage rules,
 * movement types and balance totals are exercised without a database. Row locking itself
 * needs a real database to test.
 */
const db = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn(), findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
  idempotencyRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  companyProfile: { findFirst: vi.fn() },
  branch: { findUnique: vi.fn() },
  stockItem: { findUnique: vi.fn(), findMany: vi.fn() },
  stockBalance: { update: vi.fn(), findMany: vi.fn() },
  stockMovement: { create: vi.fn() },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {} }) }));

const { createApp } = await import('../src/app');
const app = createApp();

const SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
const ITEM = '00000000-0000-4000-8000-0000000000c1';
const ACCRA = '00000000-0000-4000-8000-0000000000b1';
const KUMASI = '00000000-0000-4000-8000-0000000000b2';

const branches: Record<string, { id: string; code: string; name: string; isActive: boolean }> = {
  [ACCRA]: { id: ACCRA, code: 'ACC', name: 'Accra', isActive: true },
  [KUMASI]: { id: KUMASI, code: 'KSI', name: 'Kumasi', isActive: true },
};
const item = {
  id: ITEM,
  sku: 'MON-12',
  name: 'Patient monitor',
  unit: 'unit',
  reorderLevel: 0,
  isActive: true,
  approvalStatus: 'approved',
  purchaseCost: new Prisma.Decimal('2400.00'),
};

/** In-memory stock_balances keyed by "item:branch". */
let balances: Map<string, Prisma.Decimal>;
let movements: {
  type: string;
  branchId: string;
  quantity: Prisma.Decimal;
  reference?: string;
  sourceId?: string;
}[];

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

function signIn(keys: string[], branchIds?: string[]) {
  const all = !branchIds;
  db.userProfile.findUnique.mockResolvedValue({
    id: '00000000-0000-4000-8000-0000000000aa',
    authUserId: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    fullName: 'Test User',
    isActive: true,
    roles: [
      {
        role: {
          permissions: [...keys, 'inventory.read', ...(all ? ['branches.all_access'] : [])].map(
            (permissionKey) => ({
              permissionKey,
            }),
          ),
        },
      },
    ],
    branches: (branchIds ?? []).map((branchId) => ({ branchId })),
  });
}

let keyCounter = 0;
const post = async (path: string, body: object) =>
  request(app)
    .post(`/api/v1/stock-balances/${path}`)
    .set('Authorization', await auth())
    .set('Idempotency-Key', `test-key-${++keyCounter}-abcdef`)
    .send(body);

const total = () => [...balances.values()].reduce((sum, q) => sum.plus(q), new Prisma.Decimal(0));

beforeEach(() => {
  vi.clearAllMocks();
  balances = new Map([[`${ITEM}:${ACCRA}`, new Prisma.Decimal(10)]]);
  movements = [];
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.idempotencyRecord.create.mockResolvedValue({ id: 'record' });
  db.idempotencyRecord.update.mockResolvedValue({});
  db.idempotencyRecord.delete.mockResolvedValue({});
  db.userProfile.findMany.mockResolvedValue([]);
  db.companyProfile.findFirst.mockResolvedValue(null);
  db.branch.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(branches[where.id] ?? null),
  );
  db.stockItem.findUnique.mockResolvedValue(item);
  db.stockItem.findMany.mockResolvedValue([item]);
  db.$executeRaw.mockResolvedValue(1);
  db.$queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('FOR UPDATE')) {
      const key = `${values[0]}:${values[1]}`;
      if (!balances.has(key)) balances.set(key, new Prisma.Decimal(0));
      return Promise.resolve([{ id: key, quantityOnHand: balances.get(key) }]);
    }
    return Promise.resolve([]);
  });
  db.stockBalance.update.mockImplementation(
    ({ where, data }: { where: { id: string }; data: { quantityOnHand: Prisma.Decimal } }) => {
      balances.set(where.id, data.quantityOnHand);
      return Promise.resolve({});
    },
  );
  db.stockMovement.create.mockImplementation(({ data }: { data: (typeof movements)[number] }) => {
    movements.push(data);
    return Promise.resolve({ id: `m${movements.length}`, ...data });
  });
  db.stockBalance.findMany.mockImplementation(
    ({ where }: { where: { OR: { itemId: string; branchId: string }[] } }) =>
      Promise.resolve(
        where.OR.map((k) => ({
          id: `${k.itemId}:${k.branchId}`,
          itemId: k.itemId,
          branchId: k.branchId,
          quantityOnHand: balances.get(`${k.itemId}:${k.branchId}`) ?? new Prisma.Decimal(0),
          quantityReserved: new Prisma.Decimal(0),
          updatedAt: new Date(),
          item,
          branch: branches[k.branchId],
        })),
      ),
  );
});

describe('stock adjustments', () => {
  it('removes stock with a reason, writes an adjustment_out movement and an audit event', async () => {
    signIn(['inventory.adjust']);
    const res = await post('adjustments', {
      itemId: ITEM,
      branchId: ACCRA,
      direction: 'decrease',
      quantity: '3',
      reason: 'damaged',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^ADJ-\d{8}-[0-9A-F]{6}$/);
    expect(res.body.data.balances[0].quantityOnHand).toBe('7.000');
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'adjustment_out', branchId: ACCRA });
    expect(movements[0]!.quantity.toString()).toBe('-3');
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'stock.adjusted', entityId: ITEM }),
      }),
    );
  });

  it('adds stock with an optional unit cost', async () => {
    signIn(['inventory.adjust']);
    const res = await post('adjustments', {
      itemId: ITEM,
      branchId: ACCRA,
      direction: 'increase',
      quantity: '2',
      reason: 'found',
      unitCost: '2500',
    });
    expect(res.status).toBe(201);
    expect(movements[0]).toMatchObject({ type: 'adjustment_in', unitCost: '2500' });
    expect(balances.get(`${ITEM}:${ACCRA}`)!.toString()).toBe('12');
  });

  it('refuses to take stock below zero and names the branch and available quantity', async () => {
    signIn(['inventory.adjust']);
    const res = await post('adjustments', {
      itemId: ITEM,
      branchId: ACCRA,
      direction: 'decrease',
      quantity: '15',
      reason: 'count_correction',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.quantity).toBe(
      "There isn't enough stock at Accra to remove 15 unit. Available: 10.",
    );
    expect(movements).toHaveLength(0);
    expect(balances.get(`${ITEM}:${ACCRA}`)!.toString()).toBe('10');
  });

  it('requires a note when the reason is "other"', async () => {
    signIn(['inventory.adjust']);
    const res = await post('adjustments', {
      itemId: ITEM,
      branchId: ACCRA,
      direction: 'decrease',
      quantity: '1',
      reason: 'other',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.note).toBeDefined();
  });

  it('blocks adjustments without inventory.adjust', async () => {
    signIn(['inventory.transfer']);
    const res = await post('adjustments', {
      itemId: ITEM,
      branchId: ACCRA,
      direction: 'decrease',
      quantity: '1',
      reason: 'damaged',
    });
    expect(res.status).toBe(403);
    expect(movements).toHaveLength(0);
  });

  it('blocks adjustments at a branch the user is not assigned to', async () => {
    signIn(['inventory.adjust'], [KUMASI]);
    const res = await post('adjustments', {
      itemId: ITEM,
      branchId: ACCRA,
      direction: 'decrease',
      quantity: '1',
      reason: 'damaged',
    });
    expect(res.status).toBe(403);
    expect(movements).toHaveLength(0);
  });
});

describe('stock transfers', () => {
  it('moves stock out of one branch and into another, preserving the total', async () => {
    signIn(['inventory.transfer']);
    const before = total();
    const res = await post('transfers', {
      fromBranchId: ACCRA,
      toBranchId: KUMASI,
      items: [{ itemId: ITEM, quantity: '4' }],
      note: 'Rebalancing',
    });
    expect(res.status).toBe(201);
    expect(total().toString()).toBe(before.toString());
    expect(balances.get(`${ITEM}:${ACCRA}`)!.toString()).toBe('6');
    expect(balances.get(`${ITEM}:${KUMASI}`)!.toString()).toBe('4');
    const types = movements.map((m) => m.type).sort();
    expect(types).toEqual(['transfer_in', 'transfer_out']);
    expect(new Set(movements.map((m) => m.reference)).size).toBe(1);
    expect(movements[0]!.reference).toMatch(/^TRF-/);
    expect(movements[0]!.sourceId).toBe(movements[1]!.sourceId);
    expect(movements.every((m) => (m as { unitCost?: unknown }).unitCost !== undefined)).toBe(true);
  });

  it('rejects a transfer to the same branch', async () => {
    signIn(['inventory.transfer']);
    const res = await post('transfers', {
      fromBranchId: ACCRA,
      toBranchId: ACCRA,
      items: [{ itemId: ITEM, quantity: '1' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.toBranchId).toBeDefined();
    expect(movements).toHaveLength(0);
  });

  it('rejects a transfer of more than the source holds, without moving anything', async () => {
    signIn(['inventory.transfer']);
    const res = await post('transfers', {
      fromBranchId: ACCRA,
      toBranchId: KUMASI,
      items: [{ itemId: ITEM, quantity: '11' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields['items.0.quantity']).toContain('Available: 10');
  });

  it('rejects a transfer to an inactive branch', async () => {
    signIn(['inventory.transfer']);
    branches[KUMASI]!.isActive = false;
    try {
      const res = await post('transfers', {
        fromBranchId: ACCRA,
        toBranchId: KUMASI,
        items: [{ itemId: ITEM, quantity: '1' }],
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields.toBranchId).toBe('Choose an active branch.');
    } finally {
      branches[KUMASI]!.isActive = true;
    }
  });

  it('blocks transfers without inventory.transfer', async () => {
    signIn(['inventory.adjust']);
    const res = await post('transfers', {
      fromBranchId: ACCRA,
      toBranchId: KUMASI,
      items: [{ itemId: ITEM, quantity: '1' }],
    });
    expect(res.status).toBe(403);
  });

  it('requires an idempotency key', async () => {
    signIn(['inventory.transfer']);
    const res = await request(app)
      .post('/api/v1/stock-balances/transfers')
      .set('Authorization', await auth())
      .send({ fromBranchId: ACCRA, toBranchId: KUMASI, items: [{ itemId: ITEM, quantity: '1' }] });
    expect(res.status).toBe(400);
    expect(movements).toHaveLength(0);
  });
});
