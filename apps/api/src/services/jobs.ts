import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { recordAudit } from './audit';
import { getCompanySettings } from './company-settings';
import { emailConfigured, sendEmail } from './email';
import { purgeExpiredIdempotencyRecords } from '../middleware/idempotency';
import { reconcileBalances } from './inventory';
import { notifyLowStock, notifyPermission, usersWithPermission } from './notifications';
import { saleBalance } from '../modules/sales';

/**
 * Daily housekeeping, run by the scheduler once a day. Each job is independent: one
 * failing is logged and reported, and the rest still run. Every notification carries a
 * dedupe key, so running the jobs twice in a day notifies nobody twice.
 */

const SYSTEM = { actorId: null };
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (d: Date) => new Date(`${isoDay(d)}T00:00:00Z`);

/** Issued proformas past their validity period become expired. */
async function expireProformas(today: Date) {
  const { proformaValidityDays } = await getCompanySettings(prisma);
  const cutoff = new Date(today.getTime() - proformaValidityDays * DAY_MS);
  const stale = await prisma.proforma.findMany({
    where: { status: 'issued', issueDate: { lt: cutoff } },
    select: { id: true, number: true },
  });
  for (const p of stale) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.proforma.updateMany({ where: { id: p.id, status: 'issued' }, data: { status: 'expired' } });
      if (claimed.count === 0) return;
      await recordAudit(tx, SYSTEM, {
        action: 'proforma.expired',
        entityType: 'proforma',
        entityId: p.id,
        summary: `Proforma ${p.number} expired after ${proformaValidityDays} days without an answer`,
      });
    });
  }
  return stale.length;
}

/** Reminders 7, 3 and 1 days before a draft price schedule's submission deadline. */
async function tenderDeadlines(today: Date) {
  let sent = 0;
  for (const days of [7, 3, 1]) {
    const day = new Date(today.getTime() + days * DAY_MS);
    const due = await prisma.tender.findMany({
      where: { status: 'draft', submissionDeadline: day },
      select: { id: true, number: true, customerName: true, branchId: true },
    });
    for (const t of due) {
      await notifyPermission(prisma, 'tenders.manage', t.branchId, null, {
        type: 'tender_deadline',
        title: `${t.number} is due in ${days} day${days === 1 ? '' : 's'}`,
        body: `Price schedule for ${t.customerName} hasn't been submitted yet.`,
        link: '/tender-schedule?status=draft',
        dedupeKey: `tender-deadline:${t.id}:${days}`,
      });
      sent += 1;
    }
  }
  return sent;
}

/** Confirmed sales past their due date with money still owing. */
async function overduePayments(today: Date) {
  const sales = await prisma.sale.findMany({
    where: { status: 'confirmed', dueDate: { lt: today } },
    include: { payments: { where: { status: 'posted' }, select: { amount: true } } },
  });
  const overdue = sales.filter((s) => saleBalance(s.total, s.payments).balance.gt(0));
  for (const s of overdue) {
    const { balance } = saleBalance(s.total, s.payments);
    await notifyPermission(prisma, 'payments.record', s.branchId, null, {
      type: 'payment_overdue',
      title: `Sale ${s.number} is overdue`,
      body: `${s.customerName} owes ${s.currency} ${balance.toFixed(2)}.`,
      link: `/sales?open=${s.id}`,
      // Weekly, so an overdue sale is a reminder rather than daily noise.
      dedupeKey: `overdue:${s.id}:${Math.floor(today.getTime() / (7 * DAY_MS))}`,
    });
  }
  return overdue.length;
}

/** Registrations expiring within 30 days. */
async function registrationRenewals(today: Date) {
  const soon = await prisma.clientRegistration.findMany({
    where: { status: 'active', validUntil: { gte: today, lte: new Date(today.getTime() + 30 * DAY_MS) } },
    include: { client: { select: { name: true, branchId: true } } },
  });
  for (const r of soon) {
    await notifyPermission(prisma, 'registrations.manage', r.client.branchId, null, {
      type: 'registration_renewal',
      title: `Registration ${r.registrationNumber} expires soon`,
      body: `${r.client.name}'s registration is valid until ${isoDay(r.validUntil!)}.`,
      link: '/clients',
      dedupeKey: `registration-renewal:${r.id}:${isoDay(r.validUntil!)}`,
    });
  }
  return soon.length;
}

/** Sweeps every branch for low stock, catching items that were already low. */
async function lowStockSweep() {
  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, reorderLevel: { gt: 0 } },
    select: { id: true },
  });
  for (const b of branches) await notifyLowStock(prisma, b.id, items.map((i) => i.id));
  return branches.length;
}

/** Cached stock balances against the ledger; any difference is reported, not silently fixed. */
async function stockReconciliation(today: Date) {
  const differences = await reconcileBalances({ repair: false });
  if (differences.length > 0) {
    await notifyPermission(prisma, 'inventory.adjust', null, null, {
      type: 'stock_mismatch',
      title: `${differences.length} stock balance(s) don't match their history`,
      body: 'Run "pnpm --filter api stock:reconcile" to review and repair them.',
      link: '/stock',
      dedupeKey: `stock-mismatch:${isoDay(today)}`,
    });
  }
  return differences.length;
}

/** Old idempotency records and notifications read more than 90 days ago. */
async function cleanup(today: Date) {
  const idempotency = await purgeExpiredIdempotencyRecords();
  const { count } = await prisma.notification.deleteMany({
    where: { readAt: { lt: new Date(today.getTime() - 90 * DAY_MS) } },
  });
  return idempotency + count;
}

/** Monday email to report viewers: last week's sales, payments and expenses. */
async function weeklySummary(today: Date) {
  if (today.getUTCDay() !== 1 || !emailConfigured()) return 0;
  const from = new Date(today.getTime() - 7 * DAY_MS);
  const [sales, payments, expenses, lowStock] = await Promise.all([
    prisma.sale.groupBy({
      by: ['currency'],
      where: { status: 'confirmed', saleDate: { gte: from, lt: today } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.payment.groupBy({
      by: ['currency'],
      where: { status: 'posted', paymentDate: { gte: from, lt: today } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ['currency'],
      where: { status: 'approved', kind: 'general', transactionDate: { gte: from, lt: today } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.notification.count({ where: { type: 'low_stock', createdAt: { gte: from } } }),
  ]);
  const money = (rows: { currency: string; _sum: Record<string, Prisma.Decimal | null>; _count: number }[], field: string) =>
    rows.length === 0
      ? 'none'
      : rows.map((r) => `${r.currency} ${(r._sum[field] ?? new Prisma.Decimal(0)).toFixed(2)} (${r._count})`).join(', ');
  const text = [
    `Week of ${isoDay(from)} to ${isoDay(new Date(today.getTime() - DAY_MS))}`,
    '',
    `Confirmed sales: ${money(sales, 'total')}`,
    `Payments received: ${money(payments, 'amount')}`,
    `Approved general expenses: ${money(expenses, 'amount')}`,
    `Low-stock alerts raised: ${lowStock}`,
    '',
    'Figures come from the records in the system. Totals in different currencies are not added together.',
  ].join('\n');
  const recipients = await prisma.userProfile.findMany({
    where: { id: { in: await usersWithPermission(prisma, 'reports.view') } },
    select: { email: true, fullName: true },
  });
  for (const r of recipients) {
    await sendEmail({ to: r.email, toName: r.fullName, subject: 'Weekly business summary', text });
  }
  return recipients.length;
}

export async function runDailyJobs(now = new Date()) {
  const today = startOfDay(now);
  const jobs: [string, () => Promise<number>][] = [
    ['expiredProformas', () => expireProformas(today)],
    ['tenderReminders', () => tenderDeadlines(today)],
    ['overdueSales', () => overduePayments(today)],
    ['registrationRenewals', () => registrationRenewals(today)],
    ['lowStockBranches', () => lowStockSweep()],
    ['stockMismatches', () => stockReconciliation(today)],
    ['cleanedUp', () => cleanup(today)],
    ['weeklySummaryEmails', () => weeklySummary(today)],
  ];
  const results: Record<string, number | string> = {};
  for (const [name, job] of jobs) {
    try {
      results[name] = await job();
    } catch (err) {
      logger.error({ err, job: name }, 'daily job failed');
      results[name] = 'failed';
    }
  }
  logger.info({ results }, 'daily jobs finished');
  return results;
}
