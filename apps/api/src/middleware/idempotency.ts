import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { IDEMPOTENCY_HEADER } from '@tsm/shared';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getAuth } from './auth';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
/** An unfinished record older than this is treated as an interrupted attempt. */
const STALE_AFTER_MS = 2 * 60 * 1000;
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const IN_PROGRESS = 'This request is already being processed. Wait a moment and refresh.';

/**
 * Protects critical create operations from duplicate processing caused by double
 * clicks, retries and refreshes. The client sends a unique Idempotency-Key per
 * submission. The first request with a key is processed; a repeat with the same key
 * and body replays the stored 2xx response. Failed attempts (non-2xx) release the key
 * so a corrected or retried submission can proceed.
 */
export async function idempotent(req: Request, res: Response, next: NextFunction) {
  const ctx = getAuth(req);
  const key = req.header(IDEMPOTENCY_HEADER);
  if (!key || !KEY_PATTERN.test(key)) {
    throw new AppError('BAD_REQUEST', `This request needs a valid ${IDEMPOTENCY_HEADER} header.`);
  }
  const path = req.baseUrl + req.path;
  const requestHash = createHash('sha256')
    .update(stableStringify(req.body ?? null))
    .digest('hex');

  let recordId: string;
  try {
    const record = await prisma.idempotencyRecord.create({
      data: { userId: ctx.profileId, key, method: req.method, path, requestHash },
      select: { id: true },
    });
    recordId = record.id;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId: ctx.profileId, key } },
    });
    if (!existing) throw new AppError('CONFLICT', IN_PROGRESS);
    if (
      existing.method !== req.method ||
      existing.path !== path ||
      existing.requestHash !== requestHash
    ) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'This submission was already used for different information. Reload the form and submit again.',
      );
    }
    if (existing.completedAt && existing.statusCode !== null) {
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }
    const stale = Date.now() - existing.createdAt.getTime() > STALE_AFTER_MS;
    throw new AppError(
      'CONFLICT',
      stale
        ? 'A previous attempt of this submission was interrupted, so we cannot tell whether it was saved. Check the records list before submitting again.'
        : IN_PROGRESS,
    );
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const status = res.statusCode;
    const settle =
      status >= 200 && status < 300
        ? prisma.idempotencyRecord.update({
            where: { id: recordId },
            data: {
              statusCode: status,
              responseBody: body as Prisma.InputJsonValue,
              completedAt: new Date(),
            },
          })
        : prisma.idempotencyRecord.delete({ where: { id: recordId } });
    // Respond only after the outcome is stored, so an immediate retry sees it.
    settle
      .catch((err: unknown) => logger.error({ err, recordId }, 'failed to settle idempotency record'))
      .finally(() => originalJson(body));
    return res;
  };
  next();
}

export async function purgeExpiredIdempotencyRecords() {
  const cutoff = new Date(Date.now() - IDEMPOTENCY_RETENTION_MS);
  const { count } = await prisma.idempotencyRecord.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
