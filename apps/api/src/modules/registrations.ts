import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  REGISTRATION_TRANSITIONS,
  registrationCreateSchema,
  registrationListQuerySchema,
  registrationStatusSchema,
  registrationUpdateSchema,
  uuid,
  type RegistrationDto,
} from '@tsm/shared';
import { getAuth, requirePermission, type AuthContext } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { forbidden, invalidState, notFound, withFriendlyErrors } from '../lib/errors';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { dateFromIso, iso, isoDateOnly, optionalIsoDateOnly } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { canAccessBranch, optionalBranchWhere } from '../services/branch-scope';
import { nextDocumentNumber } from '../services/document-numbers';
import { findAccessibleClient } from './clients';

export const registrationsRouter = Router();

const DUPLICATE = { registrationNumber: 'This registration number is already in use.' };
const ALREADY_ACTIVE =
  'This client already has an active registration. Suspend, expire or revoke it before activating another.';

const include = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
      organizationType: true,
      contactPerson: true,
      phone: true,
      email: true,
      branchId: true,
    },
  },
} as const;

type Row = Prisma.ClientRegistrationGetPayload<{ include: typeof include }>;

function toDto(r: Row): RegistrationDto {
  const { branchId: _branchId, ...client } = r.client;
  return {
    id: r.id,
    registrationNumber: r.registrationNumber,
    registeredOn: isoDateOnly(r.registeredOn),
    validUntil: optionalIsoDateOnly(r.validUntil),
    status: r.status,
    notes: r.notes,
    client,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

async function findAccessible(db: Tx | typeof prisma, ctx: AuthContext, id: string) {
  const row = await db.clientRegistration.findUnique({ where: { id }, include });
  if (!row) throw notFound('The registration');
  if (!canAccessBranch(ctx, row.client.branchId)) throw forbidden();
  return row;
}

/**
 * Locks the client row so concurrent activations for the same client serialise, then
 * verifies no other registration of that client is active.
 */
async function assertNoOtherActive(tx: Tx, clientId: string, exceptId?: string) {
  await tx.$queryRaw`SELECT id FROM clients WHERE id = ${clientId}::uuid FOR UPDATE`;
  const other = await tx.clientRegistration.count({
    where: { clientId, status: 'active', ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (other > 0) throw invalidState(ALREADY_ACTIVE);
}

registrationsRouter.use(requirePermission('registrations.read'));

registrationsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(registrationListQuerySchema, req.query);
  const and: Prisma.ClientRegistrationWhereInput[] = [{ client: optionalBranchWhere(ctx) }];
  if (query.status) and.push({ status: query.status });
  if (query.clientId) and.push({ clientId: query.clientId });
  if (query.q) {
    and.push({
      OR: [
        { registrationNumber: { contains: query.q, mode: 'insensitive' } },
        { client: { name: { contains: query.q, mode: 'insensitive' } } },
        { client: { code: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.ClientRegistrationWhereInput = { AND: and };
  const sort = orderBy<Prisma.ClientRegistrationOrderByWithRelationInput>(
    query.sort,
    {
      registrationNumber: (dir) => ({ registrationNumber: dir }),
      registeredOn: (dir) => ({ registeredOn: dir }),
      validUntil: (dir) => ({ validUntil: { sort: dir, nulls: 'last' } }),
      client: (dir) => ({ client: { name: dir } }),
    },
    { registeredOn: 'desc' },
  );
  const [rows, total] = await Promise.all([
    prisma.clientRegistration.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.clientRegistration.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

registrationsRouter.get('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  ok(res, toDto(await findAccessible(prisma, getAuth(req), id)));
});

registrationsRouter.post('/', requirePermission('registrations.manage'), idempotent, async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(registrationCreateSchema, req.body);
  const row = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        const client = await findAccessibleClient(tx, ctx, input.clientId);
        if (client.status !== 'active') throw invalidState('Archived clients cannot be registered. Restore the client first.');
        if (input.status === 'active') await assertNoOtherActive(tx, client.id);
        const registrationNumber =
          input.registrationNumber ?? (await nextDocumentNumber(tx, 'registration'));
        const registration = await tx.clientRegistration.create({
          data: {
            clientId: client.id,
            registrationNumber,
            registeredOn: dateFromIso(input.registeredOn),
            validUntil: input.validUntil ? dateFromIso(input.validUntil) : null,
            status: input.status,
            notes: input.notes ?? null,
            createdById: ctx.profileId,
          },
          include,
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'registration.created',
          entityType: 'client_registration',
          entityId: registration.id,
          summary: `Registration ${registrationNumber} created for ${client.name} (${input.status})`,
        });
        return registration;
      }),
    DUPLICATE,
  );
  created(res, toDto(row));
});

registrationsRouter.put('/:id', requirePermission('registrations.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(registrationUpdateSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await findAccessible(tx, ctx, id);
    if (before.status === 'revoked') throw invalidState('Revoked registrations can no longer be edited.');
    const data = {
      registeredOn: dateFromIso(input.registeredOn),
      validUntil: input.validUntil ? dateFromIso(input.validUntil) : null,
      notes: input.notes ?? null,
    };
    const updated = await tx.clientRegistration.update({ where: { id }, data, include });
    await recordAudit(tx, actorFrom(req), {
      action: 'registration.updated',
      entityType: 'client_registration',
      entityId: id,
      summary: `Registration ${before.registrationNumber} updated`,
      changes: {
        registeredOn: { from: isoDateOnly(before.registeredOn), to: input.registeredOn },
        validUntil: { from: optionalIsoDateOnly(before.validUntil), to: input.validUntil ?? null },
      },
    });
    return updated;
  });
  ok(res, toDto(row));
});

registrationsRouter.post('/:id/status', requirePermission('registrations.manage'), async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const { status, reason } = parse(registrationStatusSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    const before = await findAccessible(tx, ctx, id);
    if (!REGISTRATION_TRANSITIONS[before.status].includes(status)) {
      throw invalidState(`A ${before.status} registration cannot be changed to ${status}.`);
    }
    if (status === 'active') await assertNoOtherActive(tx, before.clientId, id);
    const updated = await tx.clientRegistration.update({
      where: { id },
      data: { status, statusChangedAt: new Date() },
      include,
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'registration.status_changed',
      entityType: 'client_registration',
      entityId: id,
      summary: `Registration ${before.registrationNumber} changed from ${before.status} to ${status}`,
      changes: { status: { from: before.status, to: status }, reason: reason ?? null },
    });
    return updated;
  });
  ok(res, toDto(row));
});
