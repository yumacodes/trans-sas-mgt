import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  EXPENSE_KIND_LABELS,
  EXPENSE_KIND_SLUGS,
  EXPENSE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
  REPORT_KEYS,
  REPORT_META,
  REPORT_STATUS_FILTERS,
  reportQuerySchema,
  SALE_STATUS_LABELS,
  TENDER_STATUS_LABELS,
  type ExpenseStatus,
  type PaymentStatus,
  type PurchaseStatus,
  type ReportColumn,
  type ReportDto,
  type ReportKey,
  type ReportLink,
  type ReportQuery,
  type ReportRow,
  type SaleStatus,
  type TenderStatus,
} from '@tsm/shared';
import { z } from 'zod';
import { can, getAuth, type AuthContext } from '../middleware/auth';
import { AppError, forbidden } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { isoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { assertBranchAccess } from '../services/branch-scope';
import { pdfCompany } from '../services/pdf-company';
import { renderReportPdf } from '../services/report-pdf';
import { buildReport } from '../services/reports';
import { saleBalance } from './sales';

export const reportsRouter = Router();

const keySchema = z.enum(REPORT_KEYS);

function allowed(req: Parameters<typeof getAuth>[0], key: ReportKey) {
  if (!can(getAuth(req), REPORT_META[key].permission)) throw forbidden();
}

/*
 * Reports with a status filter (sales, payments, expenses, tenders, purchases) are built here
 * so the status can be chosen; the others come from services/reports and are given record ids
 * here for drill-down. Every row that stands for a record carries its id, and columns say
 * where they link to (see ReportLink).
 */

const LIMIT = 5000;
const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);
const money = (v: Prisma.Decimal.Value | null | undefined) => D(v).toFixed(2);

const col = (key: string, label: string, format: ReportColumn['format'] = 'text', currencyKey?: string, link?: ReportLink): ReportColumn => ({
  key,
  label,
  format,
  ...(currencyKey ? { currencyKey } : {}),
  ...(link ? { link } : {}),
});
const open = (path: string, openKey = 'id'): ReportLink => ({ path, openKey });

interface Scope {
  branch: Record<string, unknown>;
  optionalBranch: Record<string, unknown>;
  from: Date | null;
  to: Date | null;
  /** Checked against the report's options; null means the report's "all". */
  status: string | null;
}

/** The effective status: the requested one if the report offers it, else the report's default. */
function statusFor(key: ReportKey, q: ReportQuery): string | null {
  const filter = REPORT_STATUS_FILTERS[key];
  if (!filter) return null;
  if (!q.status) return filter.defaultValue ?? null;
  if (!filter.options.some((o) => o.value === q.status)) {
    throw new AppError('VALIDATION_FAILED', 'Choose one of the statuses this report offers.', { status: 'Unknown status.' });
  }
  return q.status;
}

function scopeFor(ctx: AuthContext, key: ReportKey, q: ReportQuery): Scope {
  if (q.branchId) assertBranchAccess(ctx, q.branchId);
  const ids = q.branchId ? [q.branchId] : ctx.allBranches ? null : [...ctx.branchIds];
  return {
    branch: ids ? { branchId: { in: ids } } : {},
    optionalBranch: ids ? (q.branchId ? { branchId: q.branchId } : { OR: [{ branchId: null }, { branchId: { in: ids } }] }) : {},
    from: q.dateFrom ? new Date(`${q.dateFrom}T00:00:00Z`) : null,
    to: q.dateTo ? new Date(`${q.dateTo}T00:00:00Z`) : null,
    status: statusFor(key, q),
  };
}

const dateRange = (s: Scope) =>
  s.from || s.to ? { ...(s.from ? { gte: s.from } : {}), ...(s.to ? { lte: s.to } : {}) } : undefined;

/** One total line per currency for the given money columns. */
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
type StatusReport = 'sales' | 'payments' | 'expenses' | 'tenders' | 'purchases';

const statusBuilders: Record<StatusReport, (s: Scope) => Promise<Built>> = {
  async sales(s) {
    const status = (s.status ?? 'confirmed') as SaleStatus;
    const sales = await prisma.sale.findMany({
      where: { ...s.branch, status, saleDate: dateRange(s) },
      include: { branch: { select: { code: true } }, payments: { where: { status: 'posted' }, select: { amount: true } } },
      orderBy: { saleDate: 'asc' },
      take: LIMIT,
    });
    const rows = sales.map((x) => {
      const { paid, balance } = saleBalance(x.total, x.payments);
      return {
        id: x.id,
        clientId: x.clientId,
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
      notes: [
        status === 'confirmed'
          ? 'Confirmed sales by sale date. Drafts and cancelled sales are left out.'
          : `${SALE_STATUS_LABELS[status]} sales by sale date. Only confirmed sales count as revenue.`,
      ],
      columns: [
        col('number', 'Sale', 'text', undefined, open('/sales')), col('date', 'Date', 'date'),
        col('client', 'Client', 'text', undefined, open('/clients', 'clientId')), col('branch', 'Branch'), col('currency', 'Currency'),
        col('subtotal', 'Subtotal', 'money', 'currency'), col('tax', 'Tax', 'money', 'currency'), col('total', 'Total', 'money', 'currency'),
        col('paid', 'Paid', 'money', 'currency'), col('balance', 'Balance', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['subtotal', 'tax', 'total', 'paid', 'balance']),
    };
  },

  async payments(s) {
    const status = (s.status ?? 'posted') as PaymentStatus;
    const payments = await prisma.payment.findMany({
      where: { ...s.branch, status, paymentDate: dateRange(s) },
      include: { sale: { select: { id: true, number: true, customerName: true, clientId: true } }, branch: { select: { code: true } } },
      orderBy: { paymentDate: 'asc' },
      take: LIMIT,
    });
    const rows = payments.map((p) => ({
      id: p.id,
      saleId: p.sale.id,
      clientId: p.sale.clientId,
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
      notes: [
        status === 'posted'
          ? 'Money received from customers by payment date. Reversed payments are left out. This is cash received, not sales made.'
          : `${PAYMENT_STATUS_LABELS[status]} payments by payment date. These are no longer counted as money received.`,
      ],
      columns: [
        col('number', 'Receipt', 'text', undefined, open('/payments')), col('date', 'Date', 'date'),
        col('client', 'Client', 'text', undefined, open('/clients', 'clientId')), col('sale', 'Sale', 'text', undefined, open('/sales', 'saleId')),
        col('branch', 'Branch'), col('method', 'Method'), col('reference', 'Reference'), col('currency', 'Currency'),
        col('amount', 'Amount', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['amount']),
    };
  },

  async expenses(s) {
    const status = (s.status ?? 'approved') as ExpenseStatus;
    const expenses = await prisma.expense.findMany({
      where: { ...s.optionalBranch, status, transactionDate: dateRange(s) },
      include: { branch: { select: { code: true } } },
      orderBy: { transactionDate: 'asc' },
      take: LIMIT,
    });
    const rows = expenses.map((e) => ({
      id: e.id,
      path: `/expenses/${EXPENSE_KIND_SLUGS[e.kind]}`,
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
      notes: [
        `${EXPENSE_STATUS_LABELS[status]} records by date${status === 'approved' ? '; pending, rejected and voided records are left out' : ''}. Tender-In is money received for tenders and is totalled separately from spending.`,
      ],
      columns: [
        col('number', 'Reference', 'text', undefined, { pathKey: 'path', openKey: 'id' }), col('date', 'Date', 'date'), col('kind', 'Type'),
        col('category', 'Category'), col('counterparty', 'Counterparty'), col('branch', 'Branch'), col('currency', 'Currency'),
        col('amount', 'Amount', 'money', 'currency'),
      ],
      rows,
      totals: Object.values(EXPENSE_KIND_LABELS).flatMap((kind) =>
        totalsByCurrency(rows.filter((r) => r.kind === kind), 'number', ['amount']).map((t) => ({ ...t, number: `${t.number} ${kind}` })),
      ),
    };
  },

  async tenders(s) {
    const tenders = await prisma.tender.findMany({
      where: { ...s.optionalBranch, ...(s.status ? { status: s.status as TenderStatus } : {}), scheduleDate: dateRange(s) },
      orderBy: { scheduleDate: 'asc' },
      take: LIMIT,
    });
    const rows = tenders.map((t) => ({
      id: t.id,
      clientId: t.clientId,
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
        `Price schedules by schedule date${s.status ? '' : ', whatever their status'}. A schedule is not a sale; only awarded schedules are totalled.`,
        decided.length
          ? `Award rate: ${won} of ${decided.length} decided tenders (${Math.round((won / decided.length) * 100)}%).`
          : 'No tenders shown here have been decided.',
      ],
      columns: [
        col('number', 'Schedule', 'text', undefined, open('/tender-schedule')), col('date', 'Date', 'date'),
        col('client', 'Organisation', 'text', undefined, open('/clients', 'clientId')), col('reference', 'Tender ref'),
        col('deadline', 'Deadline', 'date'), col('status', 'Status'), col('currency', 'Currency'), col('total', 'Total', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows.filter((r) => r.status === TENDER_STATUS_LABELS.awarded), 'number', ['total']).map((t) => ({
        ...t,
        number: `Awarded ${t.number}`,
      })),
    };
  },

  async purchases(s) {
    const purchases = await prisma.purchase.findMany({
      where: { ...s.branch, status: s.status ? (s.status as PurchaseStatus) : { not: 'cancelled' }, purchaseDate: dateRange(s) },
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { code: true } },
        items: { select: { quantity: true, receivedQuantity: true } },
      },
      orderBy: { purchaseDate: 'asc' },
      take: LIMIT,
    });
    const rows = purchases.map((p) => {
      const ordered = p.items.reduce((a, i) => a.plus(i.quantity), D(0));
      const received = p.items.reduce((a, i) => a.plus(i.receivedQuantity), D(0));
      return {
        id: p.id,
        supplierId: p.supplier.id,
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
      notes: [
        `Purchases by order date${s.status ? '' : ', excluding cancelled ones'}. "Received" is the share of ordered units that has arrived.`,
      ],
      columns: [
        col('number', 'PO', 'text', undefined, open('/purchases')), col('date', 'Date', 'date'),
        col('supplier', 'Supplier', 'text', undefined, open('/suppliers', 'supplierId')), col('branch', 'Branch'), col('status', 'Status'),
        col('received', 'Received', 'percent'), col('currency', 'Currency'), col('total', 'Total', 'money', 'currency'),
      ],
      rows,
      totals: totalsByCurrency(rows, 'number', ['total']),
    };
  },
};

const isStatusReport = (key: ReportKey): key is StatusReport => key in statusBuilders;

/** Map of unique business reference → record ids, for rows built without them. */
async function idsBy<T extends { id: string }>(values: (string | number | null | undefined)[], find: (refs: string[]) => Promise<T[]>, refOf: (r: T) => string) {
  const refs = [...new Set(values.filter((v): v is string => typeof v === 'string' && v !== ''))];
  if (refs.length === 0) return new Map<string, T>();
  return new Map((await find(refs)).map((r) => [refOf(r), r]));
}

/** Adds ids and links to the reports built by services/reports. */
async function withLinks(key: ReportKey, built: Built): Promise<Built> {
  const rows = built.rows;
  const linkColumns = (links: Record<string, ReportLink>) => built.columns.map((c) => (links[c.key] ? { ...c, link: links[c.key] } : c));

  switch (key) {
    case 'stock':
    case 'stock-movement':
    case 'low-stock': {
      const items = await idsBy(rows.map((r) => r.sku), (skus) => prisma.stockItem.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } }), (i) => i.sku);
      for (const r of rows) r.itemId = items.get(String(r.sku))?.id ?? null;
      return { ...built, columns: linkColumns({ sku: open('/stock-items', 'itemId'), name: open('/stock-items', 'itemId') }) };
    }
    case 'clients': {
      const clients = await idsBy(rows.map((r) => r.code), (codes) => prisma.client.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }), (c) => c.code);
      for (const r of rows) r.clientId = clients.get(String(r.code))?.id ?? null;
      return { ...built, columns: linkColumns({ code: open('/clients', 'clientId'), name: open('/clients', 'clientId') }) };
    }
    case 'outstanding-balances': {
      const sales = await idsBy(
        rows.map((r) => r.number),
        (numbers) => prisma.sale.findMany({ where: { number: { in: numbers } }, select: { id: true, number: true, clientId: true } }),
        (x) => x.number,
      );
      for (const r of rows) {
        const sale = sales.get(String(r.number));
        r.id = sale?.id ?? null;
        r.clientId = sale?.clientId ?? null;
      }
      return { ...built, columns: linkColumns({ number: open('/sales'), client: open('/clients', 'clientId') }) };
    }
    case 'branch-performance': {
      // Rows name the branch; names are matched only where they are unambiguous.
      const branches = await prisma.branch.findMany({ where: { name: { in: rows.map((r) => String(r.branch)) } }, select: { id: true, name: true } });
      const byName = new Map<string, string | null>();
      for (const b of branches) byName.set(b.name, byName.has(b.name) ? null : b.id);
      for (const r of rows) r.branchId = byName.get(String(r.branch)) ?? null;
      const filtered = (path: string, fixed?: Record<string, string>): ReportLink => ({ path, scoped: true, filters: { branchId: 'branchId' }, ...(fixed ? { fixed } : {}) });
      return {
        ...built,
        columns: linkColumns({
          branch: filtered('/sales', { status: 'confirmed' }),
          sales: filtered('/sales', { status: 'confirmed' }),
          payments: filtered('/payments', { status: 'posted' }),
          expenses: filtered('/expenses/general', { status: 'approved' }),
        }),
      };
    }
    case 'income-statement': {
      for (const r of rows) {
        r.path = r.section === 'Revenue' ? '/sales' : r.section === 'Operating expenses' ? '/expenses/general' : null;
        r.status = r.section === 'Revenue' ? 'confirmed' : r.section === 'Operating expenses' ? 'approved' : null;
      }
      return { ...built, columns: linkColumns({ line: { pathKey: 'path', scoped: true, filters: { status: 'status' } } }) };
    }
    case 'tax-summary': {
      for (const r of rows) r.path = String(r.kind).includes('sales') ? '/sales' : '/purchases';
      for (const r of rows) r.status = r.path === '/sales' ? 'confirmed' : null;
      return { ...built, columns: linkColumns({ kind: { pathKey: 'path', scoped: true, filters: { status: 'status' } } }) };
    }
    default:
      return built;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-01" → "1 Oct 2026", independent of the server's locale. */
function longDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function runReport(ctx: AuthContext, key: ReportKey, q: ReportQuery): Promise<ReportDto> {
  const meta = REPORT_META[key];
  const scope = scopeFor(ctx, key, q);
  let report: ReportDto;
  if (isStatusReport(key)) {
    const built = await statusBuilders[key](scope);
    if (built.rows.length >= LIMIT) built.notes.push(`Only the first ${LIMIT} rows are shown. Narrow the period to see the rest.`);
    report = { key, title: meta.title, criteria: [], generatedAt: new Date().toISOString(), ...built };
  } else {
    const base = await buildReport(ctx, key, { dateFrom: q.dateFrom, dateTo: q.dateTo, branchId: q.branchId });
    report = { ...base, ...(await withLinks(key, base)) };
  }

  const filter = REPORT_STATUS_FILTERS[key];
  const branchName = q.branchId ? (await prisma.branch.findUnique({ where: { id: q.branchId }, select: { name: true } }))?.name : undefined;
  report.criteria = [
    meta.usesDates
      ? `Period: ${q.dateFrom ? longDate(q.dateFrom) : 'the beginning'} – ${q.dateTo ? longDate(q.dateTo) : 'today'}`
      : `As at: ${longDate(localToday())}`,
    `Branch: ${q.branchId ? (branchName ?? 'Unknown branch') : ctx.allBranches ? 'All' : 'Your branches'}`,
    ...(filter ? [`Status: ${filter.options.find((o) => o.value === scope.status)?.label ?? filter.allLabel ?? 'All'}`] : []),
  ];
  return report;
}

reportsRouter.get('/:key', async (req, res) => {
  const key = parse(keySchema, req.params.key);
  allowed(req, key);
  ok(res, await runReport(getAuth(req), key, parse(reportQuerySchema, req.query)));
});

reportsRouter.get('/:key/pdf', async (req, res) => {
  const key = parse(keySchema, req.params.key);
  allowed(req, key);
  const report = await runReport(getAuth(req), key, parse(reportQuerySchema, req.query));
  const pdf = await renderReportPdf(report, await pdfCompany(report.title));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${key}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});
