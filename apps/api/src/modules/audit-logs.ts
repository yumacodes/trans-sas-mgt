import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { auditListQuerySchema } from '@tsm/shared';
import { requirePermission } from '../middleware/auth';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { auditInclude, toAuditDto } from '../services/audit';

export const auditLogsRouter = Router();

auditLogsRouter.get('/', requirePermission('audit.read'), async (req, res) => {
  const query = parse(auditListQuerySchema, req.query);
  const where: Prisma.AuditLogWhereInput = {
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00Z`) } : {}),
            ...(query.dateTo ? { lt: new Date(new Date(`${query.dateTo}T00:00:00Z`).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { summary: { contains: query.q, mode: 'insensitive' } },
            { action: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const sort = orderBy<Prisma.AuditLogOrderByWithRelationInput>(
    query.sort,
    { createdAt: (dir) => ({ createdAt: dir }), action: (dir) => ({ action: dir }) },
    { createdAt: 'desc' },
  );
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: sort, include: auditInclude, ...pageWindow(query) }),
    prisma.auditLog.count({ where }),
  ]);
  ok(res, rows.map(toAuditDto), pageMeta(query, total));
});
