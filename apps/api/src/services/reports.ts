import { Prisma } from '@prisma/client';
import {
  EXPENSE_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PURCHASE_STATUS_LABELS,
  REPORT_META,
  STOCK_MOVEMENT_LABELS,
  TENDER_STATUS_LABELS,
  type ReportColumn,
  type ReportDto,
  type ReportKey,
  type ReportQuery,
  type ReportRow,
} from '@tsm/shared';
import type { AuthContext } from '../middleware/auth';
import { assertBranchAccess } from './branch-scope';
import { prisma } from '../lib/prisma';
import { isoDateOnly } from '../lib/serialize';
import { saleBalance } from '../modules/sales';

/**
 * Report calculations. Each report reads the records it summarises directly, so its totals
 * reconcile with the underlying lists. Definitions are stated in each report's notes.
 */

const LIMIT = 5000;
const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);
const money = (v: Prisma.Decimal.Value | null | undefined) => D(v).toFixed(2);

interface Scope {
  /** Required-branch filter (sales, payments, stock…). */
  branch: Record<string, unknown>;
  /** Optional-branch filter (expenses, clients, tenders…), where no branch means company-wide. */
  optionalBranch: Record<string, unknown>;
  branchIds: string[] | null;
  from: Date | null;
  to: Date | null;
}

function scopeFor(ctx: AuthContext, q: ReportQuery): Scope {
  if (q.branchId) assertBranchAccess(ctx, q.branchId);
  const ids = q.branchId ? [q.branchId] : ctx.allBranches ? null : [...ctx.branchIds];
  return {
    branch: ids ? { branchId: { in: ids } } : {},
    optionalBranch: ids ? (q.branchId ? { branchId: q.branchId } : { OR: [{ branchId: null }, { branchId: { in: ids } }] }) : {},
    branchIds: ids,
    from: q.dateFrom ? new Date(`${q.dateFrom}T00:00:00Z`) : null,
    to: q.dateTo ? new Date(`${q.dateTo}T00:00:00Z`) : null,
  };
}

const dateRange = (s: Scope) =>
  s.from || s.to ? { ...(s.from ? { gte: s.from } : {}), ...(s.to ? { lte: s.to } : {}) } : undefined;

/** Adds one total line per currency for the given money columns. */
function totalsByCurrency(rows: ReportRow[], label: string, fields: string[], currencyKey = 'currency'): ReportRow[] {
  const byCurrency = new Map<string, Record<string, Prisma.Decimal>>();
  for (const r of rows) {
    const cur = String(r[currencyKey] ?? '');
    const acc = byCurrency.get(cur) ?? Object.fromEntries(fields.map((f) => [f, D(0)]));
    for (const f of fields) acc[f] = acc[f]!.plus(D(r[f] as string | number | null));
    byCurrency.set(cur, acc);
  }
  return [...byCurrency].map(([cur, sums]) => ({
    [label]: `Total ${cur}`,
    [currencyKey]: cur,
    count: rows.filter((r) => r[currencyKey] === cur).length,
    ...Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v.toFixed(2)])),
  }));
}

type Built = Pick<ReportDto, 'notes' | 'columns' | 'rows' | 'totals'>;
const col = (key: string, label: string, format: ReportColumn['format'] = 'text', currencyKey?: string): ReportColumn => ({
  key,
  label,
  format,
  ...(currencyKey ? { currencyKey } : {}),
});

/** Weighted average cost per item from inbound movements that carry a cost. */
async function averageCosts() {
  const rows = await prisma.$queryRaw<{ itemId: string; cost: Prisma.Decimal | null }[]>`
    SELECT "itemId", SUM(quantity * "unitCost") / NULLIF(SUM(quantity), 0) AS cost
    FROM stock_movements
    WHERE "unitCost" IS NOT NULL AND quantity > 0
      AND type IN ('opening_balance', 'purchase_receipt', 'adjustment_in')
    GROUP BY "itemId"`;
  return new Map(rows.map((r) => [r.itemId, r.cost ? D(r.cost) : null]));
}

const builders: Record<ReportKey, (s: Scope) => Promise<Built>> = {
  async sales(s) {
    const sales = await prisma.sale.findMany({
      where: { ...s.branch, status: 'confirmed', saleDate: dateRange(s) },
      include: { branch: { select: { code: true } }, payments: { where: { status: 'posted' }, select: { amount: true } } },
      orderBy: { saleDate: 'asc' },
      take: LIMIT,
    });
    const rows = sales.map((x) => {
      const { paid, balance } = saleBalance(x.total, x.payments);
      return {
        number: x.number,
        date: isoDateOnly(x.saleDate),
        client: x.customerName,
        branch: x.branch.code,
        currency: x.currency,
        subtotal: money(x.subtotal),
        tax: money(x.taxAmount),
        total: money(x.total),
        paid: money(paid),
        balance: money(balance),
      };
    });
    return {
      notes: ['Confirmed sales by sale date. Drafts and cancelled sales are left out.'],
      columns: [
        col('number', 'Sale'), col('date', 'Date', 'date'), col('client', 'Client'), col('branch', 'Branch'), col('currency', 'Currency'),
        col('subtotal', 'Subtotal', 'money', 'currency'), col('tax', 'Tax', 'money', 'currency'), col('total', 'Total', 'money', 'currency'),
        col('paid', 'Paid', 'money', 'currency'), col('balance', 'Balance', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['subtotal', 'tax', 'total', 'paid', 'balance']),
    };
  },

  async payments(s) {
    const payments = await prisma.payment.findMany({
      where: { ...s.branch, status: 'posted', paymentDate: dateRange(s) },
      include: { sale: { select: { number: true, customerName: true } }, branch: { select: { code: true } } },
      orderBy: { paymentDate: 'asc' },
      take: LIMIT,
    });
    const rows = payments.map((p) => ({
      number: p.number,
      date: isoDateOnly(p.paymentDate),
      client: p.sale.customerName,
      sale: p.sale.number,
      branch: p.branch.code,
      method: PAYMENT_METHOD_LABELS[p.method],
      reference: p.externalReference,
      currency: p.currency,
      amount: money(p.amount),
    }));
    return {
      notes: ['Money received from customers by payment date. Reversed payments are left out. This is cash received, not sales made.'],
      columns: [
        col('number', 'Receipt'), col('date', 'Date', 'date'), col('client', 'Client'), col('sale', 'Sale'), col('branch', 'Branch'),
        col('method', 'Method'), col('reference', 'Reference'), col('currency', 'Currency'), col('amount', 'Amount', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['amount']),
    };
  },

  async expenses(s) {
    const expenses = await prisma.expense.findMany({
      where: { ...s.optionalBranch, status: 'approved', transactionDate: dateRange(s) },
      include: { branch: { select: { code: true } } },
      orderBy: { transactionDate: 'asc' },
      take: LIMIT,
    });
    const rows = expenses.map((e) => ({
      number: e.number,
      date: isoDateOnly(e.transactionDate),
      kind: EXPENSE_KIND_LABELS[e.kind],
      category: e.category,
      counterparty: e.counterparty,
      branch: e.branch?.code ?? 'Company-wide',
      currency: e.currency,
      amount: money(e.amount),
    }));
    return {
      notes: ['Approved records by date. Pending, rejected and voided records are left out. Tender-In is money received for tenders and is listed separately from spending.'],
      columns: [
        col('number', 'Reference'), col('date', 'Date', 'date'), col('kind', 'Type'), col('category', 'Category'), col('counterparty', 'Counterparty'),
        col('branch', 'Branch'), col('currency', 'Currency'), col('amount', 'Amount', 'money', 'currency'),
      ],
      rows,
      totals: ['General', 'Tender-In', 'Tender-Out'].flatMap((kind) =>
        totalsByCurrency(rows.filter((r) => r.kind === kind), 'number', ['amount']).map((t) => ({ ...t, number: `${t.number} ${kind}` })),
      ),
    };
  },

  async tenders(s) {
    const tenders = await prisma.tender.findMany({
      where: { ...s.optionalBranch, scheduleDate: dateRange(s) },
      orderBy: { scheduleDate: 'asc' },
      take: LIMIT,
    });
    const rows = tenders.map((t) => ({
      number: t.number,
      date: isoDateOnly(t.scheduleDate),
      client: t.customerName,
      reference: t.tenderReference,
      deadline: t.submissionDeadline ? isoDateOnly(t.submissionDeadline) : null,
      status: TENDER_STATUS_LABELS[t.status],
      currency: t.currency,
      total: money(t.total),
    }));
    const decided = tenders.filter((t) => t.status === 'awarded' || t.status === 'not_awarded');
    const won = tenders.filter((t) => t.status === 'awarded').length;
    return {
      notes: [
        'Price schedules by schedule date, whatever their status. A schedule is not a sale.',
        decided.length ? `Award rate: ${won} of ${decided.length} decided tenders (${Math.round((won / decided.length) * 100)}%).` : 'No tenders have been decided in this period.',
      ],
      columns: [
        col('number', 'Schedule'), col('date', 'Date', 'date'), col('client', 'Organisation'), col('reference', 'Tender ref'),
        col('deadline', 'Deadline', 'date'), col('status', 'Status'), col('currency', 'Currency'), col('total', 'Total', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows.filter((r) => r.status === 'Awarded'), 'number', ['total']).map((t) => ({ ...t, number: `Awarded ${t.number}` })),
    };
  },

  async stock(s) {
    const [balances, costs] = await Promise.all([
      prisma.stockBalance.findMany({
        where: { ...s.branch, quantityOnHand: { not: 0 } },
        include: { item: { select: { id: true, sku: true, name: true, unit: true } }, branch: { select: { code: true } } },
        orderBy: [{ item: { name: 'asc' } }],
        take: LIMIT,
      }),
      averageCosts(),
    ]);
    const rows = balances.map((b) => {
      const cost = costs.get(b.item.id);
      return {
        sku: b.item.sku,
        name: b.item.name,
        branch: b.branch.code,
        quantity: D(b.quantityOnHand).toFixed(3),
        unit: b.item.unit,
        unitCost: cost ? cost.toFixed(2) : null,
        value: cost ? cost.times(b.quantityOnHand).toFixed(2) : null,
        currency: cost ? 'Cost' : null,
      };
    });
    const valued = rows.filter((r) => r.value !== null);
    return {
      notes: [
        'On-hand quantity per item and branch, from the stock ledger.',
        'Valuation uses the weighted average cost of every receipt, opening balance and adjustment that recorded a cost. Items with no recorded cost are not valued.',
        'Costs are in the currency purchases were recorded in; mixing currencies in purchases makes this valuation approximate.',
      ],
      columns: [
        col('sku', 'Item code'), col('name', 'Item'), col('branch', 'Branch'), col('quantity', 'On hand', 'quantity'), col('unit', 'Unit'),
        col('unitCost', 'Average cost', 'money'), col('value', 'Value', 'money'),
      ],
      rows,
      totals: [
        {
          sku: 'Total value',
          value: valued.reduce((sum, r) => sum.plus(D(r.value)), D(0)).toFixed(2),
          count: rows.length,
          name: `${rows.length - valued.length} line(s) without a cost`,
        },
      ],
    };
  },

  async 'stock-movement'(s) {
    const range = dateRange(s);
    const movements = await prisma.stockMovement.findMany({
      where: {
        ...s.branch,
        ...(range ? { occurredAt: { ...(s.from ? { gte: s.from } : {}), ...(s.to ? { lt: new Date(s.to.getTime() + 86_400_000) } : {}) } } : {}),
      },
      include: { item: { select: { sku: true, name: true } }, branch: { select: { code: true } }, actor: { select: { fullName: true } } },
      orderBy: { occurredAt: 'asc' },
      take: LIMIT,
    });
    const rows = movements.map((m) => ({
      date: m.occurredAt.toISOString().slice(0, 10),
      sku: m.item.sku,
      name: m.item.name,
      branch: m.branch.code,
      type: STOCK_MOVEMENT_LABELS[m.type],
      quantity: D(m.quantity).toFixed(3),
      reference: m.reference,
      by: m.actor?.fullName ?? 'System',
    }));
    const inbound = movements.filter((m) => D(m.quantity).gt(0)).reduce((a, m) => a.plus(m.quantity), D(0));
    const outbound = movements.filter((m) => D(m.quantity).lt(0)).reduce((a, m) => a.plus(m.quantity), D(0));
    return {
      notes: ['Every stock movement in the period, oldest first. Positive quantities came in; negative went out.'],
      columns: [
        col('date', 'Date', 'date'), col('sku', 'Item code'), col('name', 'Item'), col('branch', 'Branch'), col('type', 'Movement'),
        col('quantity', 'Quantity', 'quantity'), col('reference', 'Reference'), col('by', 'By'),
      ],
      rows,
      totals: [
        { date: 'Units in', quantity: inbound.toFixed(3), count: null },
        { date: 'Units out', quantity: outbound.toFixed(3), count: null },
      ],
    };
  },

  async 'low-stock'(s) {
    const branchFilter = s.branchIds
      ? Prisma.sql`AND b."branchId" IN (${Prisma.join(s.branchIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<{ sku: string; name: string; branch: string; onHand: Prisma.Decimal; reorderLevel: number; unit: string }[]>`
      SELECT i.sku, i.name, br.code AS branch, b."quantityOnHand" AS "onHand", i."reorderLevel", i.unit
      FROM stock_balances b
      JOIN stock_items i ON i.id = b."itemId"
      JOIN branches br ON br.id = b."branchId"
      WHERE i."isActive" = TRUE AND i."reorderLevel" > 0 AND b."quantityOnHand" <= i."reorderLevel" ${branchFilter}
      ORDER BY i.name
      LIMIT ${LIMIT}`;
    return {
      notes: ['Active items at or below their reorder level at each branch that holds them. Use "Draft from low stock" on the Purchase page to order them.'],
      columns: [col('sku', 'Item code'), col('name', 'Item'), col('branch', 'Branch'), col('onHand', 'On hand', 'quantity'), col('reorderLevel', 'Reorder level', 'count'), col('unit', 'Unit')],
      rows: rows.map((r) => ({ ...r, onHand: D(r.onHand).toFixed(3) })),
      totals: [{ sku: 'Items to reorder', count: rows.length }],
    };
  },

  async purchases(s) {
    const purchases = await prisma.purchase.findMany({
      where: { ...s.branch, status: { not: 'cancelled' }, purchaseDate: dateRange(s) },
      include: { supplier: { select: { name: true } }, branch: { select: { code: true } }, items: { select: { quantity: true, receivedQuantity: true } } },
      orderBy: { purchaseDate: 'asc' },
      take: LIMIT,
    });
    const rows = purchases.map((p) => {
      const ordered = p.items.reduce((a, i) => a.plus(i.quantity), D(0));
      const received = p.items.reduce((a, i) => a.plus(i.receivedQuantity), D(0));
      return {
        number: p.number,
        date: isoDateOnly(p.purchaseDate),
        supplier: p.supplier.name,
        branch: p.branch.code,
        status: PURCHASE_STATUS_LABELS[p.status],
        received: ordered.gt(0) ? Number(received.div(ordered).times(100).toFixed(0)) : 0,
        currency: p.currency,
        total: money(p.total),
      };
    });
    return {
      notes: ['Purchases by order date, excluding cancelled ones. "Received" is the share of ordered units that has arrived.'],
      columns: [
        col('number', 'PO'), col('date', 'Date', 'date'), col('supplier', 'Supplier'), col('branch', 'Branch'), col('status', 'Status'),
        col('received', 'Received', 'percent'), col('currency', 'Currency'), col('total', 'Total', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['total']),
    };
  },

  async clients(s) {
    const clients = await prisma.client.findMany({
      where: { ...s.optionalBranch, status: 'active' },
      include: {
        sales: {
          where: { status: 'confirmed', saleDate: dateRange(s) },
          select: { currency: true, total: true, payments: { where: { status: 'posted' }, select: { amount: true } } },
        },
      },
      orderBy: { name: 'asc' },
      take: LIMIT,
    });
    const rows = clients.flatMap((c): ReportRow[] => {
      const byCurrency = new Map<string, { count: number; total: Prisma.Decimal; balance: Prisma.Decimal }>();
      for (const sale of c.sales) {
        const acc = byCurrency.get(sale.currency) ?? { count: 0, total: D(0), balance: D(0) };
        acc.count += 1;
        acc.total = acc.total.plus(sale.total);
        acc.balance = acc.balance.plus(saleBalance(sale.total, sale.payments).balance);
        byCurrency.set(sale.currency, acc);
      }
      if (byCurrency.size === 0) return [{ code: c.code, name: c.name, sales: 0, currency: null, total: null, balance: null }];
      return [...byCurrency].map(([currency, v]) => ({
        code: c.code,
        name: c.name,
        sales: v.count,
        currency,
        total: v.total.toFixed(2),
        balance: v.balance.toFixed(2),
      }));
    });
    return {
      notes: ['Active clients with their confirmed sales in the period and what they still owe on them. A client buying in two currencies has a line for each.'],
      columns: [
        col('code', 'Code'), col('name', 'Client'), col('sales', 'Sales', 'count'), col('currency', 'Currency'),
        col('total', 'Sales total', 'money', 'currency'), col('balance', 'Outstanding', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows.filter((r) => r.currency), 'code', ['total', 'balance']),
    };
  },

  async 'outstanding-balances'(s) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const sales = await prisma.sale.findMany({
      where: { ...s.branch, status: 'confirmed' },
      include: { payments: { where: { status: 'posted' }, select: { amount: true } }, branch: { select: { code: true } } },
      orderBy: { saleDate: 'asc' },
      take: LIMIT,
    });
    const rows = sales
      .map((x) => ({ x, balance: saleBalance(x.total, x.payments).balance }))
      .filter((r) => r.balance.gt(0))
      .map(({ x, balance }) => ({
        number: x.number,
        client: x.customerName,
        date: isoDateOnly(x.saleDate),
        due: x.dueDate ? isoDateOnly(x.dueDate) : null,
        daysOverdue: x.dueDate && x.dueDate < today ? Math.floor((today.getTime() - x.dueDate.getTime()) / 86_400_000) : 0,
        branch: x.branch.code,
        currency: x.currency,
        total: money(x.total),
        balance: balance.toFixed(2),
      }));
    return {
      notes: ['Confirmed sales with money still owing today, whatever their date. A sale without a due date is never counted as overdue.'],
      columns: [
        col('number', 'Sale'), col('client', 'Client'), col('date', 'Sale date', 'date'), col('due', 'Due', 'date'), col('daysOverdue', 'Days overdue', 'count'),
        col('branch', 'Branch'), col('currency', 'Currency'), col('total', 'Total', 'money', 'currency'), col('balance', 'Outstanding', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['total', 'balance']),
    };
  },

  async 'branch-performance'(s) {
    const range = dateRange(s);
    const branches = await prisma.branch.findMany({
      where: { isActive: true, ...(s.branchIds ? { id: { in: s.branchIds } } : {}) },
      orderBy: { name: 'asc' },
    });
    const [sales, payments, expenses] = await Promise.all([
      prisma.sale.groupBy({ by: ['branchId', 'currency'], where: { status: 'confirmed', saleDate: range }, _sum: { total: true }, _count: true }),
      prisma.payment.groupBy({ by: ['branchId', 'currency'], where: { status: 'posted', paymentDate: range }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['branchId', 'currency'], where: { status: 'approved', kind: 'general', transactionDate: range }, _sum: { amount: true } }),
    ]);
    const rows: ReportRow[] = [];
    for (const b of branches) {
      const currencies = new Set([...sales, ...payments, ...expenses].filter((r) => r.branchId === b.id).map((r) => r.currency));
      if (currencies.size === 0) rows.push({ branch: b.name, currency: null, sales: 0, salesTotal: null, payments: null, expenses: null });
      for (const cur of currencies) {
        const sale = sales.find((r) => r.branchId === b.id && r.currency === cur);
        rows.push({
          branch: b.name,
          currency: cur,
          sales: sale?._count ?? 0,
          salesTotal: money(sale?._sum.total),
          payments: money(payments.find((r) => r.branchId === b.id && r.currency === cur)?._sum.amount),
          expenses: money(expenses.find((r) => r.branchId === b.id && r.currency === cur)?._sum.amount),
        });
      }
    }
    return {
      notes: ['Per branch and currency: confirmed sales, payments received and approved general expenses in the period. Company-wide expenses are not assigned to a branch.'],
      columns: [
        col('branch', 'Branch'), col('currency', 'Currency'), col('sales', 'Sales', 'count'), col('salesTotal', 'Sales total', 'money', 'currency'),
        col('payments', 'Payments received', 'money', 'currency'), col('expenses', 'Expenses', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows.filter((r) => r.currency), 'branch', ['salesTotal', 'payments', 'expenses']),
    };
  },

  async 'income-statement'(s) {
    const range = dateRange(s);
    const [sales, expenses, cogsRows, company] = await Promise.all([
      prisma.sale.groupBy({ by: ['currency'], where: { ...s.branch, status: 'confirmed', saleDate: range }, _sum: { subtotal: true } }),
      prisma.expense.groupBy({ by: ['currency', 'category'], where: { ...s.optionalBranch, status: 'approved', kind: 'general', transactionDate: range }, _sum: { amount: true } }),
      prisma.$queryRaw<{ currency: string; cost: Prisma.Decimal | null; uncosted: bigint }[]>`
        SELECT s.currency,
               SUM(-m.quantity * m."unitCost") AS cost,
               COUNT(*) FILTER (WHERE m."unitCost" IS NULL) AS uncosted
        FROM stock_movements m
        JOIN sales s ON s.id = m."sourceId"::uuid
        WHERE m."sourceType" = 'sale' AND m.type = 'sale_issue' AND s.status = 'confirmed'
          ${s.branchIds ? Prisma.sql`AND s."branchId" IN (${Prisma.join(s.branchIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
          ${s.from ? Prisma.sql`AND s."saleDate" >= ${s.from}` : Prisma.empty}
          ${s.to ? Prisma.sql`AND s."saleDate" <= ${s.to}` : Prisma.empty}
        GROUP BY s.currency`,
      prisma.companyProfile.findFirst({ select: { defaultCurrency: true } }),
    ]);
    const currencies = new Set([...sales.map((r) => r.currency), ...expenses.map((r) => r.currency), ...cogsRows.map((r) => r.currency)]);
    const rows: ReportRow[] = [];
    const totals: ReportRow[] = [];
    let uncosted = 0;
    for (const cur of [...currencies].sort()) {
      const revenue = D(sales.find((r) => r.currency === cur)?._sum.subtotal);
      const cogsRow = cogsRows.find((r) => r.currency === cur);
      const cogs = D(cogsRow?.cost);
      uncosted += Number(cogsRow?.uncosted ?? 0);
      const opex = expenses.filter((r) => r.currency === cur);
      const opexTotal = opex.reduce((a, r) => a.plus(D(r._sum.amount)), D(0));
      rows.push({ section: 'Revenue', line: 'Sales (excluding tax)', currency: cur, amount: revenue.toFixed(2) });
      rows.push({ section: 'Cost of goods sold', line: 'Stock issued on those sales, at cost', currency: cur, amount: cogs.neg().toFixed(2) });
      rows.push({ section: 'Gross profit', line: '', currency: cur, amount: revenue.minus(cogs).toFixed(2) });
      for (const e of opex) rows.push({ section: 'Operating expenses', line: e.category, currency: cur, amount: D(e._sum.amount).neg().toFixed(2) });
      totals.push({ section: `Net result ${cur}`, currency: cur, amount: revenue.minus(cogs).minus(opexTotal).toFixed(2) });
    }
    return {
      notes: [
        'A management report built from the records in this system, not a statutory financial statement.',
        'Revenue is confirmed sales, excluding tax, by sale date. Payments received are not revenue and are not counted here.',
        'Cost of goods sold is the stock issued on those sales at the item cost recorded when each sale was confirmed.',
        'Operating expenses are approved general expenses. Tender-In and Tender-Out transactions are not included; see the Expense Report.',
        `Each currency is shown separately and never added to another. The company's default currency is ${company?.defaultCurrency ?? 'not set'}.`,
        ...(uncosted > 0 ? [`${uncosted} stock line(s) had no recorded cost, so cost of goods sold is understated.`] : []),
      ],
      columns: [col('section', 'Section'), col('line', 'Line'), col('currency', 'Currency'), col('amount', 'Amount', 'money', 'currency')],
      rows,
      totals,
    };
  },

  async 'tax-summary'(s) {
    const range = dateRange(s);
    const [salesTax, purchaseTax] = await Promise.all([
      prisma.sale.groupBy({ by: ['currency'], where: { ...s.branch, status: 'confirmed', saleDate: range }, _sum: { taxAmount: true, subtotal: true }, _count: true }),
      prisma.purchase.groupBy({ by: ['currency'], where: { ...s.branch, status: { in: ['ordered', 'partially_received', 'received'] }, purchaseDate: range }, _sum: { taxAmount: true, subtotal: true }, _count: true }),
    ]);
    const rows: ReportRow[] = [
      ...salesTax.map((r) => ({ kind: 'Tax charged on sales', currency: r.currency, documents: r._count, taxable: money(r._sum.subtotal), tax: money(r._sum.taxAmount) })),
      ...purchaseTax.map((r) => ({ kind: 'Tax paid on purchases', currency: r.currency, documents: r._count, taxable: money(r._sum.subtotal), tax: money(r._sum.taxAmount) })),
    ];
    return {
      notes: [
        'Tax on confirmed sales and on ordered or received purchases, by document date.',
        'This summarises what the documents record. Check it against the tax rules that apply to you before filing.',
      ],
      columns: [col('kind', 'Type'), col('currency', 'Currency'), col('documents', 'Documents', 'count'), col('taxable', 'Taxable amount', 'money', 'currency'), col('tax', 'Tax', 'money', 'currency')],
      rows,
      totals: [],
    };
  },
};

export async function buildReport(ctx: AuthContext, key: ReportKey, query: ReportQuery): Promise<ReportDto> {
  const scope = scopeFor(ctx, query);
  const built = await builders[key](scope);
  const meta = REPORT_META[key];
  const criteria = [
    meta.usesDates ? `Period: ${query.dateFrom ?? 'the beginning'} to ${query.dateTo ?? 'today'}` : 'As at today',
    query.branchId ? `Branch: ${(await prisma.branch.findUnique({ where: { id: query.branchId } }))?.name ?? query.branchId}` : ctx.allBranches ? 'All branches' : 'Your branches',
  ];
  if (built.rows.length >= LIMIT) built.notes.push(`Only the first ${LIMIT} rows are shown. Narrow the period to see the rest.`);
  return { key, title: meta.title, criteria, generatedAt: new Date().toISOString(), ...built };
}
