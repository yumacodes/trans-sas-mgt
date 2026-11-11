import type { Request } from 'express';
import { z } from 'zod';
import type { ProformaCustomerOptionDto, ProformaItemOptionDto } from '@tsm/shared';
import { can, getAuth, type AuthContext } from '../middleware/auth';
import { prisma, type Tx } from '../lib/prisma';
import { decimalString } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from './audit';
import { optionalBranchWhere } from './branch-scope';
import { nextDocumentNumber } from './document-numbers';
import { findAccessibleClient } from '../modules/clients';
import { AppError, invalidState } from '../lib/errors';

const searchQuery = z.object({ q: z.string().trim().max(100).optional() });

/** Active clients the user can see, with the details that fill a document's customer section. */
export async function customerOptions(req: Request): Promise<ProformaCustomerOptionDto[]> {
  const ctx = getAuth(req);
  const { q } = parse(searchQuery, req.query);
  const rows = await prisma.client.findMany({
    where: {
      status: 'active',
      ...optionalBranchWhere(ctx),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    select: { id: true, code: true, name: true, billingAddress: true, email: true, phone: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  return rows.map((c) => ({ id: c.id, code: c.code, name: c.name, address: c.billingAddress, email: c.email, phone: c.phone }));
}

/** Active stock items; picking one fills the unit and price. */
export async function stockItemOptions(req: Request): Promise<ProformaItemOptionDto[]> {
  const { q } = parse(searchQuery, req.query);
  const rows = await prisma.stockItem.findMany({
    where: {
      isActive: true,
      approvalStatus: 'approved',
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    select: { id: true, sku: true, name: true, unit: true, sellingPrice: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  return rows.map((i) => ({ ...i, sellingPrice: decimalString(i.sellingPrice) }));
}

/** Throws a field error unless every referenced stock item exists. */
export async function assertStockItemsExist(tx: Tx, ids: (string | null | undefined)[], field = 'items') {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return;
  const found = await tx.stockItem.count({ where: { id: { in: unique }, approvalStatus: 'approved' } });
  if (found !== unique.length) {
    const message = 'One of the selected items no longer exists or is awaiting approval. Pick another.';
    throw new AppError('VALIDATION_FAILED', message, { [field]: message });
  }
}

/**
 * Link a document to the client directory: the chosen client, an existing active client
 * with the same name, or (when the user may create clients) a new one from the typed details.
 */
export async function resolveClient(
  tx: Tx,
  req: Request,
  ctx: AuthContext,
  input: { clientId?: string | null; name: string; address?: string | null; email?: string | null; phone?: string | null },
  source: string,
): Promise<string | null> {
  if (input.clientId) {
    const client = await findAccessibleClient(tx, ctx, input.clientId);
    if (client.status !== 'active') throw invalidState(`This client is archived. Restore it before raising a ${source}.`);
    return client.id;
  }
  const existing = await tx.client.findFirst({
    where: { name: { equals: input.name, mode: 'insensitive' }, status: 'active', ...optionalBranchWhere(ctx) },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!can(ctx, 'clients.create')) return null;
  const client = await tx.client.create({
    data: {
      code: await nextDocumentNumber(tx, 'client'),
      name: input.name,
      organizationType: 'other',
      email: input.email ?? null,
      phone: input.phone ?? null,
      billingAddress: input.address ?? null,
      createdById: ctx.profileId,
    },
  });
  await recordAudit(tx, actorFrom(req), {
    action: 'client.created',
    entityType: 'client',
    entityId: client.id,
    summary: `Client ${client.code} – ${client.name} created from a ${source}`,
  });
  return client.id;
}

/** Last confirmed selling price per stock item for one client, newest first. */
export async function lastPrices(ctx: AuthContext, clientId: string) {
  const rows = await prisma.saleItem.findMany({
    where: {
      stockItemId: { not: null },
      sale: { clientId, status: 'confirmed', ...(ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } }) },
    },
    select: { stockItemId: true, unitPrice: true, sale: { select: { number: true, saleDate: true, currency: true } } },
    orderBy: { sale: { saleDate: 'desc' } },
    take: 500,
  });
  const latest: Record<string, { unitPrice: string; currency: string; saleNumber: string; saleDate: string }> = {};
  for (const r of rows) {
    if (latest[r.stockItemId!]) continue;
    latest[r.stockItemId!] = {
      unitPrice: decimalString(r.unitPrice),
      currency: r.sale.currency,
      saleNumber: r.sale.number,
      saleDate: r.sale.saleDate.toISOString().slice(0, 10),
    };
  }
  return latest;
}
