import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { AuditEntryDto } from '@tsm/shared';
import type { Db } from '../lib/prisma';
import { iso } from '../lib/serialize';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Prisma.InputJsonValue;
}

export interface AuditActor {
  actorId: string | null;
  requestId?: string;
}

export function actorFrom(req: Request): AuditActor {
  return { actorId: req.auth?.profileId ?? null, requestId: req.id ? String(req.id) : undefined };
}

/**
 * Append an audit event. Pass the transaction client so the event commits or rolls
 * back together with the change it describes. The table is append-only (trigger).
 */
export async function recordAudit(db: Db, actor: AuditActor, event: AuditEvent) {
  await db.auditLog.create({
    data: {
      actorId: actor.actorId,
      requestId: actor.requestId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      summary: event.summary,
      changes: event.changes,
    },
  });
}

type Comparable = string | number | boolean | null | undefined | Date | { toString(): string };

type JsonScalar = string | number | boolean | null;

function normalise(value: Comparable): JsonScalar {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return value.toString();
  return value;
}

/** Field-level change summary between two records, limited to the listed fields. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T & string)[],
): Record<string, { from: JsonScalar; to: JsonScalar }> {
  const out: Record<string, { from: JsonScalar; to: JsonScalar }> = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const from = normalise(before[f] as Comparable);
    const to = normalise(after[f] as Comparable);
    if (from !== to) out[f] = { from, to };
  }
  return out;
}

export const auditInclude = { actor: { select: { id: true, fullName: true } } } as const;

export function toAuditDto(row: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
  actor: { id: string; fullName: string } | null;
}): AuditEntryDto {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    actor: row.actor,
    createdAt: iso(row.createdAt),
  };
}
