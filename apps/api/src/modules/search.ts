import { Router } from 'express';
import { z } from 'zod';
import type { SearchResultDto } from '@tsm/shared';
import { can, getAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { branchWhere, optionalBranchWhere } from '../services/branch-scope';

/**
 * One search across the records the user may open: a few matches per kind, each with the
 * page that opens it. Permissions and branch scope are applied per kind, as on its own page.
 */
export const searchRouter = Router();

const TAKE = 5;

searchRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const { q } = parse(z.object({ q: z.string().trim().min(2).max(100) }), req.query);
  const has = (field: string) => ({ [field]: { contains: q, mode: 'insensitive' as const } });
  const results: SearchResultDto[] = [];
  const add = (kind: string, rows: { id: string; title: string; detail?: string | null }[], page: string) => {
    for (const r of rows) results.push({ kind, id: r.id, title: r.title, detail: r.detail ?? null, link: `${page}?open=${r.id}` });
  };

  await Promise.all([
    can(ctx, 'clients.read') &&
      prisma.client
        .findMany({ where: { ...optionalBranchWhere(ctx), OR: [has('name'), has('code'), has('email')] }, take: TAKE, select: { id: true, name: true, code: true } })
        .then((rows) => add('Client', rows.map((r) => ({ id: r.id, title: r.name, detail: r.code })), '/clients')),
    can(ctx, 'stock_items.read') &&
      prisma.stockItem
        .findMany({ where: { OR: [has('name'), has('sku'), has('brand'), has('model')] }, take: TAKE, select: { id: true, name: true, sku: true } })
        .then((rows) => add('Stock item', rows.map((r) => ({ id: r.id, title: r.name, detail: r.sku })), '/stock-items')),
    can(ctx, 'proformas.read') &&
      prisma.proforma
        .findMany({ where: { ...optionalBranchWhere(ctx), OR: [has('number'), has('customerName')] }, take: TAKE, orderBy: { issueDate: 'desc' }, select: { id: true, number: true, customerName: true } })
        .then((rows) => add('Proforma', rows.map((r) => ({ id: r.id, title: r.number, detail: r.customerName })), '/proforma')),
    can(ctx, 'tenders.read') &&
      prisma.tender
        .findMany({ where: { ...optionalBranchWhere(ctx), OR: [has('number'), has('customerName'), has('tenderReference')] }, take: TAKE, orderBy: { scheduleDate: 'desc' }, select: { id: true, number: true, customerName: true } })
        .then((rows) => add('Price schedule', rows.map((r) => ({ id: r.id, title: r.number, detail: r.customerName })), '/tender-schedule')),
    can(ctx, 'sales.read') &&
      prisma.sale
        .findMany({ where: { ...branchWhere(ctx), OR: [has('number'), has('customerName')] }, take: TAKE, orderBy: { saleDate: 'desc' }, select: { id: true, number: true, customerName: true } })
        .then((rows) => add('Sale', rows.map((r) => ({ id: r.id, title: r.number, detail: r.customerName })), '/sales')),
    can(ctx, 'waybills.read') &&
      prisma.waybill
        .findMany({ where: { ...branchWhere(ctx), OR: [has('number'), has('recipientName')] }, take: TAKE, orderBy: { deliveryDate: 'desc' }, select: { id: true, number: true, recipientName: true } })
        .then((rows) => add('Waybill', rows.map((r) => ({ id: r.id, title: r.number, detail: r.recipientName })), '/waybills')),
    can(ctx, 'payments.read') &&
      prisma.payment
        .findMany({ where: { ...branchWhere(ctx), OR: [has('number'), has('externalReference')] }, take: TAKE, orderBy: { paymentDate: 'desc' }, select: { id: true, number: true, sale: { select: { customerName: true } } } })
        .then((rows) => add('Payment', rows.map((r) => ({ id: r.id, title: r.number, detail: r.sale.customerName })), '/payments')),
    can(ctx, 'acceptance.read') &&
      prisma.acceptanceLetter
        .findMany({ where: { ...optionalBranchWhere(ctx), OR: [has('number'), has('recipientName'), has('contractNumber')] }, take: TAKE, orderBy: { letterDate: 'desc' }, select: { id: true, number: true, recipientName: true } })
        .then((rows) => add('Acceptance letter', rows.map((r) => ({ id: r.id, title: r.number, detail: r.recipientName })), '/acceptance-letters')),
    can(ctx, 'purchases.read') &&
      prisma.purchase
        .findMany({ where: { ...branchWhere(ctx), OR: [has('number'), has('supplierReference'), { supplier: has('name') }] }, take: TAKE, orderBy: { purchaseDate: 'desc' }, select: { id: true, number: true, supplier: { select: { name: true } } } })
        .then((rows) => add('Purchase', rows.map((r) => ({ id: r.id, title: r.number, detail: r.supplier.name })), '/purchases')),
  ]);
  ok(res, results);
});
