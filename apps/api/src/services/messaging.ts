import type { Prisma } from '@prisma/client';
import {
  MESSAGE_MAX_RECIPIENTS,
  ORGANIZATION_TYPE_LABELS,
  renderTemplate,
  type MessageAudience,
  type MessageFilters,
  type MessageRecipientKind,
} from '@tsm/shared';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import type { AuthContext } from '../middleware/auth';
import { assertBranchAccess, optionalBranchWhere } from '../services/branch-scope';
import { describeSendFailure, emailConfigured, sendEmail, EMAIL_NOT_CONFIGURED } from './email';

/**
 * Who a message goes to, and how it is delivered.
 *
 * The recipient list is always built here, on the server, from the audience and its
 * filters: the browser may only narrow it (`recipientIds`), never widen it. Client
 * audiences are additionally limited to the branches the sender may see, so a
 * branch-scoped user cannot email the whole client directory.
 */

export interface ResolvedRecipient {
  kind: MessageRecipientKind;
  /** Client, user profile or branch id, depending on the audience. */
  id: string;
  name: string;
  email: string | null;
  /** Secondary line shown in the review list. */
  detail: string | null;
  /** Merge-field values for this recipient. */
  values: Record<string, string | null>;
}

export const NO_EMAIL_REASON = 'No email address on record.';

function firstWord(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

async function commonValues() {
  const company = await prisma.companyProfile.findFirst({ select: { name: true } });
  return {
    company_name: company?.name ?? '',
    today: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}

/** One more than the cap, so callers can tell "exactly 500" from "too many". */
const TAKE = MESSAGE_MAX_RECIPIENTS + 1;

export async function resolveRecipients(
  ctx: AuthContext,
  audience: MessageAudience,
  filters: MessageFilters,
  recipientIds?: string[],
): Promise<ResolvedRecipient[]> {
  assertBranchAccess(ctx, filters.branchId);
  // An explicitly empty list means "nobody", never "everybody".
  if (recipientIds && recipientIds.length === 0) return [];
  const subset = recipientIds ? { id: { in: recipientIds } } : {};
  const common = await commonValues();

  if (audience === 'clients') {
    const rows = await prisma.client.findMany({
      where: {
        ...optionalBranchWhere(ctx),
        ...(filters.status === 'all' ? {} : { status: 'active' }),
        ...(filters.organizationType ? { organizationType: filters.organizationType } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.registeredOnly ? { registrations: { some: { status: 'active' } } } : {}),
        ...subset,
      },
      include: { branch: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: TAKE,
    });
    return rows.map((client) => ({
      kind: 'client' as const,
      id: client.id,
      name: client.name,
      email: client.email,
      detail: [client.code, client.branch?.name].filter(Boolean).join(' · ') || null,
      values: {
        ...common,
        recipient_name: client.name,
        first_name: client.contactPerson ? firstWord(client.contactPerson) : firstWord(client.name),
        email: client.email,
        client_code: client.code,
        contact_person: client.contactPerson,
        organisation_type: ORGANIZATION_TYPE_LABELS[client.organizationType],
        branch: client.branch?.name ?? null,
      },
    }));
  }

  if (audience === 'users') {
    const rows = await prisma.userProfile.findMany({
      where: {
        ...(filters.activeOnly === false ? {} : { isActive: true }),
        ...(filters.roleId ? { roles: { some: { roleId: filters.roleId } } } : {}),
        ...(filters.branchId ? { branches: { some: { branchId: filters.branchId } } } : {}),
        ...subset,
      },
      include: {
        branches: { include: { branch: { select: { name: true } } } },
        roles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { fullName: 'asc' },
      take: TAKE,
    });
    return rows.map((user) => {
      const branches = user.branches.map((b) => b.branch.name).join(', ');
      return {
        kind: 'user' as const,
        id: user.id,
        name: user.fullName,
        email: user.email,
        detail: [user.roles.map((r) => r.role.name).join(', ') || 'No role', branches]
          .filter(Boolean)
          .join(' · '),
        values: {
          ...common,
          recipient_name: user.fullName,
          first_name: firstWord(user.fullName),
          email: user.email,
          username: user.username,
          branch: branches || null,
        },
      };
    });
  }

  const branches = await prisma.branch.findMany({
    where: {
      isActive: true,
      managerUserId: { not: null },
      ...(filters.branchId ? { id: filters.branchId } : {}),
      ...(ctx.allBranches ? {} : { id: { in: [...ctx.branchIds] } }),
      ...subset,
    },
    include: { manager: { select: { id: true, fullName: true, email: true, isActive: true } } },
    orderBy: { name: 'asc' },
    take: TAKE,
  });
  return branches
    .filter((branch) => branch.manager?.isActive)
    .map((branch) => ({
      kind: 'branch_manager' as const,
      id: branch.id,
      name: branch.manager!.fullName,
      email: branch.manager!.email,
      detail: `${branch.name} · ${branch.code}`,
      values: {
        ...common,
        recipient_name: branch.manager!.fullName,
        first_name: firstWord(branch.manager!.fullName),
        email: branch.manager!.email,
        branch: branch.name,
        branch_code: branch.code,
      },
    }));
}

export function overRecipientLimit(recipients: unknown[]) {
  return recipients.length > MESSAGE_MAX_RECIPIENTS;
}

/* ---------- Delivery ---------- */

/** Messages currently being sent by this process, so a retry cannot double-send. */
const inFlight = new Set<string>();

/** True while this process is sending the message. */
export function isDispatching(messageId: string) {
  return inFlight.has(messageId);
}

/**
 * Send every pending recipient of a message, updating each row as it goes so the
 * Communication page can show progress. Runs after the HTTP response: a send of a few
 * hundred emails takes longer than a request should.
 */
export async function dispatchMessage(messageId: string): Promise<void> {
  if (inFlight.has(messageId)) return;
  inFlight.add(messageId);
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return;
    await prisma.message.update({ where: { id: messageId }, data: { status: 'sending' } });

    const pending = await prisma.messageRecipient.findMany({
      where: { messageId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    for (const recipient of pending) {
      if (!recipient.email) {
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: { status: 'skipped', error: NO_EMAIL_REASON },
        });
        continue;
      }
      const values = (recipient.values ?? {}) as Record<string, string | null>;
      try {
        await sendEmail({
          to: recipient.email,
          toName: recipient.name,
          subject: renderTemplate(message.subject, values),
          text: renderTemplate(message.body, values),
        });
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: { status: 'sent', sentAt: new Date(), error: null },
        });
      } catch (err) {
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'failed',
            error: err instanceof AppError ? err.message : describeSendFailure(err),
          },
        });
      }
    }
    await finaliseMessage(messageId);
  } catch (err) {
    logger.error({ err, messageId }, 'message dispatch failed');
    await finaliseMessage(messageId).catch(() => undefined);
  } finally {
    inFlight.delete(messageId);
  }
}

/** Recount outcomes from the recipient rows: they are the record of what happened. */
export async function finaliseMessage(messageId: string) {
  const counts = await prisma.messageRecipient.groupBy({
    by: ['status'],
    where: { messageId },
    _count: { _all: true },
  });
  const of = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;
  const sentCount = of('sent');
  const failedCount = of('failed');
  const skippedCount = of('skipped');
  const stillPending = of('pending');
  const status =
    stillPending > 0
      ? 'sending'
      : failedCount > 0 && sentCount === 0
        ? 'failed'
        : failedCount > 0
          ? 'partially_sent'
          : 'sent';
  await prisma.message.update({
    where: { id: messageId },
    data: {
      sentCount,
      failedCount,
      skippedCount,
      status,
      completedAt: stillPending > 0 ? null : new Date(),
    },
  });
}

export function assertEmailAvailable() {
  if (!emailConfigured()) throw new AppError('SERVICE_UNAVAILABLE', EMAIL_NOT_CONFIGURED);
}

export function recipientCreateData(
  recipients: ResolvedRecipient[],
): Prisma.MessageRecipientCreateManyMessageInput[] {
  return recipients.map((r) => ({
    kind: r.kind,
    recipientId: r.id,
    name: r.name,
    email: r.email,
    values: r.values as Prisma.InputJsonValue,
    // Recipients with no address are never attempted; they are reported as skipped.
    status: r.email ? ('pending' as const) : ('skipped' as const),
    error: r.email ? null : NO_EMAIL_REASON,
  }));
}
