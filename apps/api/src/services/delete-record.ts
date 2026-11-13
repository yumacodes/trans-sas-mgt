import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AppError, notFound } from '../lib/errors';
import { prisma, type Tx } from '../lib/prisma';
import { actorFrom, recordAudit } from './audit';

/**
 * Deletes a record that nothing else depends on. `remove` loads the record, checks that its
 * state allows deletion, deletes it and returns a summary for the audit trail. Records that
 * other records still point to are refused by the database and reported in plain words.
 */
export async function deleteRecord(
  req: Request,
  entityType: string,
  id: string,
  what: string,
  remove: (tx: Tx) => Promise<string>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const summary = await remove(tx);
      await recordAudit(tx, actorFrom(req), {
        action: `${entityType}.deleted`,
        entityType,
        entityId: id,
        summary,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2003' || error.code === 'P2014')) {
      throw new AppError(
        'CONFLICT',
        `This ${what} is used by other records, so it can't be deleted without breaking their history. Archive, cancel or deactivate it instead.`,
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw notFound(`The ${what}`);
    throw error;
  }
}

/** Throws unless `status` is one of the states in which a record may still be deleted. */
export function onlyWhen(status: string, allowed: readonly string[], message: string) {
  if (!allowed.includes(status)) throw new AppError('INVALID_STATE', message);
}
