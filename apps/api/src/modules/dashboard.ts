import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { DASHBOARD_RANGES, type DashboardOverviewDto, type DashboardRange, type DashboardSummaryDto } from '@tsm/shared';
import { uuid } from '@tsm/shared';
import { z } from 'zod';
import { can, getAuth, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { auditInclude, toAuditDto } from '../services/audit';
import { assertBranchAccess, optionalBranchWhere } from '../services/branch-scope';
import { lowStockItemIds } from '../services/inventory';

export const dashboardRouter = Router();

/**
 * Each figure is a live count with a documented definition (see DashboardSummaryDto).
 * Figures the caller may not see are returned as null, never as zero.
 */
dashboardRouter.get('/summary', requirePermission('dashboard.view'), async (req, res) => {
  const ctx = getAuth(req);
  const { branchId } = parse(z.object({ branchId: uuid.optional() }), req.query);
  if (branchId) assertBranchAccess(ctx, branchId);
  // One branch's overview counts only that branch; otherwise everything the user can see.
  const scope = branchId ? { branchId } : optionalBranchWhere(ctx);
  const stockCtx = branchId ? { ...ctx, allBranches: false, branchIds: [branchId] } : ctx;
  const clientScope = scope;

  const [
    activeClients,
    registeredClients,
    activeStockItems,
    lowStock,
    activeBranches,
    openProformas,
    openTenders,
    pendingExpenses,
    recent,
  ] = await Promise.all([
      can(ctx, 'clients.read') ? prisma.client.count({ where: { status: 'active', ...clientScope } }) : null,
      can(ctx, 'registrations.read')
        ? prisma.client.count({ where: { ...clientScope, registrations: { some: { status: 'active' } } } })
        : null,
      can(ctx, 'stock_items.read') ? prisma.stockItem.count({ where: { isActive: true } }) : null,
      can(ctx, 'inventory.read') ? lowStockItemIds(prisma, stockCtx) : null,
      can(ctx, 'branches.read') ? prisma.branch.count({ where: { isActive: true } }) : null,
      can(ctx, 'proformas.read')
        ? prisma.proforma.count({ where: { ...scope, status: { in: ['draft', 'issued'] } } })
        : null,
      can(ctx, 'tenders.read')
        ? prisma.tender.count({ where: { ...scope, status: { in: ['draft', 'submitted'] } } })
        : null,
      can(ctx, 'expenses.read') ? prisma.expense.count({ where: { ...scope, status: 'pending' } }) : null,
      can(ctx, 'audit.read')
        ? prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: auditInclude })
        : null,
    ]);

  const summary: DashboardSummaryDto = {
    activeClients,
    registeredClients,
    activeStockItems,
    lowStockItems: lowStock ? lowStock.length : null,
    activeBranches,
    openProformas,
    openTenders,
    pendingExpenses,
    recentActivity: recent ? recent.map(toAuditDto) : null,
  };
  ok(res, summary);
});

/* ---------- Charted overview ---------- */

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => new Date(`${isoDay(d)}T00:00:00Z`);

/** Start of the current month, quarter or year, and the same span one period earlier. */
function periods(range: DashboardRange, today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const startMonth = range === 'month' ? m : range === 'quarter' ? m - (m % 3) : 0;
  const lengthMonths = range === 'month' ? 1 : range === 'quarter' ? 3 : 12;
  const from = new Date(Date.UTC(y, startMonth, 1));
  const previousFrom = new Date(Date.UTC(y, startMonth - lengthMonths, 1));
  // The previous period covers the same number of days, so a partial month compares fairly.
  const elapsed = Math.round((today.getTime() - from.getTime()) / DAY);
  const previousTo = new Date(Math.min(previousFrom.getTime() + elapsed * DAY, from.getTime() - DAY));
  return { from, to: today, previousFrom, previousTo };
}

dashboardRouter.get('/overview', requirePermission('dashboard.view'), async (req, res) => {
  const ctx = getAuth(req);
  const { branchId, range } = parse(
    z.object({ branchId: uuid.optional(), range: z.enum(DASHBOARD_RANGES).default('quarter') }),
    req.query,
  );
  if (branchId) assertBranchAccess(ctx, branchId);
  const ids = branchId ? [branchId] : ctx.allBranches ? null : [...ctx.branchIds];
  const inBranch = ids ? { branchId: { in: ids } } : {};
  const stockCtx = ids ? { ...ctx, allBranches: false, branchIds: ids } : ctx;
  const branchSql = ids ? Prisma.sql`AND s."branchId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty;

  const today = utcDay(new Date());
  const p = periods(range, today);
  const yearAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const twoYearsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 23, 1));
  const company = await prisma.companyProfile.findFirst({ select: { defaultCurrency: true } });
  const currency = company?.defaultCurrency ?? 'GHS';
  const seeSales = can(ctx, 'sales.read');
  const seeMoney = can(ctx, 'payments.read');

  const sumSales = (from: Date, to: Date) =>
    prisma.sale.aggregate({ where: { ...inBranch, status: 'confirmed', currency, saleDate: { gte: from, lte: to } }, _sum: { total: true } });
  const sumPayments = (from: Date, to: Date) =>
    prisma.payment.aggregate({ where: { ...inBranch, status: 'posted', currency, paymentDate: { gte: from, lte: to } }, _sum: { amount: true } });

  const [salesNow, salesBefore, payNow, payBefore, openSales, monthlyRows, priorRows, segmentRows, otherCurrencies] = await Promise.all([
    seeSales ? sumSales(p.from, p.to) : null,
    seeSales ? sumSales(p.previousFrom, p.previousTo) : null,
    seeMoney ? sumPayments(p.from, p.to) : null,
    seeMoney ? sumPayments(p.previousFrom, p.previousTo) : null,
    seeSales
      ? prisma.sale.findMany({
          where: { ...inBranch, status: 'confirmed', currency },
          select: { total: true, dueDate: true, payments: { where: { status: 'posted' }, select: { amount: true } } },
        })
      : null,
    seeSales
      ? prisma.$queryRaw<{ month: string; revenue: Prisma.Decimal; sales: Prisma.Decimal }[]>`
          SELECT to_char(s."saleDate", 'YYYY-MM') AS month, SUM(s.subtotal) AS revenue, SUM(s.total) AS sales
          FROM sales s
          WHERE s.status = 'confirmed' AND s.currency = ${currency} AND s."saleDate" >= ${yearAgo} ${branchSql}
          GROUP BY 1`
      : null,
    seeSales
      ? prisma.sale.aggregate({
          where: { ...inBranch, status: 'confirmed', currency, saleDate: { gte: twoYearsAgo, lt: yearAgo } },
          _sum: { subtotal: true },
        })
      : null,
    seeSales
      ? prisma.$queryRaw<{ label: string | null; recent: Prisma.Decimal; previous: Prisma.Decimal }[]>`
          SELECT c.name AS label,
                 SUM(CASE WHEN s."saleDate" >= ${yearAgo} THEN si.amount ELSE 0 END) AS recent,
                 SUM(CASE WHEN s."saleDate" < ${yearAgo} THEN si.amount ELSE 0 END) AS previous
          FROM sale_items si
          JOIN sales s ON s.id = si."saleId"
          LEFT JOIN stock_items i ON i.id = si."stockItemId"
          LEFT JOIN stock_categories c ON c.id = i."categoryId"
          WHERE s.status = 'confirmed' AND s.currency = ${currency} AND s."saleDate" >= ${twoYearsAgo} ${branchSql}
          GROUP BY 1
          ORDER BY recent DESC`
      : null,
    seeSales
      ? prisma.sale.findMany({ where: { ...inBranch, status: 'confirmed', currency: { not: currency } }, distinct: ['currency'], select: { currency: true } })
      : [],
  ]);
  const paymentsByMonth = seeMoney
    ? await prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
        SELECT to_char(p."paymentDate", 'YYYY-MM') AS month, SUM(p.amount) AS amount
        FROM payments p
        WHERE p.status = 'posted' AND p.currency = ${currency} AND p."paymentDate" >= ${yearAgo}
          ${ids ? Prisma.sql`AND p."branchId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
        GROUP BY 1`
    : [];

  const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);
  const months = Array.from({ length: 12 }, (_, i) => isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + i, 1))).slice(0, 7));

  let outstanding: DashboardOverviewDto['outstanding'] = null;
  if (openSales) {
    let value = D(0);
    let overdueCount = 0;
    for (const s of openSales) {
      const owed = D(s.total).minus(s.payments.reduce((a, x) => a.plus(x.amount), D(0)));
      if (owed.lte(0)) continue;
      value = value.plus(owed);
      if (s.dueDate && s.dueDate < today) overdueCount += 1;
    }
    outstanding = { value: value.toFixed(2), overdueCount };
  }

  // Segments: the three biggest categories, with everything else together.
  let segments: DashboardOverviewDto['segments'] = null;
  if (segmentRows) {
    const named = segmentRows.map((r) => ({ label: r.label ?? 'Uncategorised', revenue: D(r.recent), previous: D(r.previous) }));
    const top = named.slice(0, 3);
    const rest = named.slice(3);
    if (rest.length) {
      top.push({
        label: 'Everything else',
        revenue: rest.reduce((a, r) => a.plus(r.revenue), D(0)),
        previous: rest.reduce((a, r) => a.plus(r.previous), D(0)),
      });
    }
    segments = top.filter((s) => s.revenue.gt(0) || s.previous.gt(0)).map((s) => ({ label: s.label, revenue: s.revenue.toFixed(2), previous: s.previous.toFixed(2) }));
  }

  let inventory: DashboardOverviewDto['inventory'] = null;
  if (can(ctx, 'inventory.read')) {
    const [items, low] = await Promise.all([
      prisma.stockItem.findMany({ where: { isActive: true }, select: { id: true, category: { select: { name: true } } } }),
      lowStockItemIds(prisma, stockCtx),
    ]);
    const lowSet = new Set(low);
    const byCategory = new Map<string, { tracked: number; below: number }>();
    for (const item of items) {
      const name = item.category?.name ?? 'Uncategorised';
      const acc = byCategory.get(name) ?? { tracked: 0, below: 0 };
      acc.tracked += 1;
      if (lowSet.has(item.id)) acc.below += 1;
      byCategory.set(name, acc);
    }
    inventory = [...byCategory].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.tracked - a.tracked).slice(0, 6);
  }

  const soon = new Date(today.getTime() + 14 * DAY);
  const [tenders, dueSales, deliveries] = await Promise.all([
    can(ctx, 'tenders.read')
      ? prisma.tender.findMany({
          where: { ...(ids ? { branchId: { in: ids } } : {}), status: 'draft', submissionDeadline: { gte: today, lte: soon } },
          select: { id: true, number: true, customerName: true, submissionDeadline: true },
          take: 10,
        })
      : [],
    seeSales
      ? prisma.sale.findMany({
          where: { ...inBranch, status: 'confirmed', dueDate: { lte: soon } },
          select: { id: true, number: true, customerName: true, dueDate: true, total: true, currency: true, payments: { where: { status: 'posted' }, select: { amount: true } } },
          orderBy: { dueDate: 'asc' },
          take: 30,
        })
      : [],
    can(ctx, 'purchases.read')
      ? prisma.purchase.findMany({
          where: { ...inBranch, status: { in: ['ordered', 'partially_received'] }, expectedDate: { lte: soon } },
          select: { id: true, number: true, expectedDate: true, supplier: { select: { name: true } } },
          take: 10,
        })
      : [],
  ]);
  const upcoming: DashboardOverviewDto['upcoming'] = [
    ...tenders.map((t) => ({ date: isoDay(t.submissionDeadline!), kind: 'tender' as const, title: `Submit ${t.number}`, detail: t.customerName, link: `/tender-schedule?open=${t.id}` })),
    ...dueSales
      .filter((s) => D(s.total).gt(s.payments.reduce((a, x) => a.plus(x.amount), D(0))))
      .map((s) => ({ date: isoDay(s.dueDate!), kind: 'due' as const, title: `Payment due on ${s.number}`, detail: s.customerName, link: `/sales?open=${s.id}` })),
    ...deliveries.map((d) => ({ date: isoDay(d.expectedDate!), kind: 'delivery' as const, title: `${d.number} expected`, detail: d.supplier.name, link: `/purchases?open=${d.id}` })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const activity = can(ctx, 'audit.read')
    ? (await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: auditInclude })).map(toAuditDto)
    : null;

  const overview: DashboardOverviewDto = {
    currency,
    otherCurrencies: otherCurrencies.map((c) => c.currency),
    range,
    period: { from: isoDay(p.from), to: isoDay(p.to), previousFrom: isoDay(p.previousFrom), previousTo: isoDay(p.previousTo) },
    sales: salesNow && salesBefore ? { value: D(salesNow._sum.total).toFixed(2), previous: D(salesBefore._sum.total).toFixed(2) } : null,
    payments: payNow && payBefore ? { value: D(payNow._sum.amount).toFixed(2), previous: D(payBefore._sum.amount).toFixed(2) } : null,
    outstanding,
    monthly: monthlyRows
      ? months.map((month) => {
          const row = monthlyRows.find((r) => r.month === month);
          return {
            month,
            revenue: D(row?.revenue).toFixed(2),
            sales: D(row?.sales).toFixed(2),
            payments: D(paymentsByMonth.find((r) => r.month === month)?.amount).toFixed(2),
          };
        })
      : null,
    priorYearRevenue: priorRows ? D(priorRows._sum.subtotal).toFixed(2) : null,
    segments,
    inventory,
    upcoming,
    activity,
  };
  ok(res, overview);
});
