import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Message, MessageRecipient, Prisma, UserProfile } from '@prisma/client';
import {
  MESSAGE_MAX_RECIPIENTS,
  MESSAGE_RECIPIENT_PREVIEW_LIMIT,
  messageAudienceRequestSchema,
  messageInputSchema,
  messageListQuerySchema,
  messageFiltersSchema,
  renderTemplate,
  uuid,
  type MessageAudiencePreviewDto,
  type MessageDetailDto,
  type MessageDto,
  type MessageRecipientDto,
} from '@tsm/shared';
import { getAuth, requireAnyPermission, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { emailConfig, verifyEmailTransport } from '../services/email';
import {
  assertEmailAvailable,
  dispatchMessage,
  finaliseMessage,
  overRecipientLimit,
  recipientCreateData,
  resolveRecipients,
} from '../services/messaging';

/**
 * Communication: one composed message delivered by email to clients, staff users or
 * branch managers. Sending is authorised by `messages.send`; the history needs
 * `messages.read`. Recipients are resolved server-side (see services/messaging.ts).
 */
export const messagesRouter = Router();

function toDto(
  row: Message & { createdBy: Pick<UserProfile, 'id' | 'fullName'> | null },
): MessageDto {
  return {
    id: row.id,
    audience: row.audience,
    filters: messageFiltersSchema.catch({}).parse(row.filters),
    subject: row.subject,
    body: row.body,
    status: row.status,
    recipientCount: row.recipientCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    completedAt: row.completedAt ? iso(row.completedAt) : null,
  };
}

function toRecipientDto(row: MessageRecipient): MessageRecipientDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    email: row.email,
    status: row.status,
    error: row.error,
    sentAt: row.sentAt ? iso(row.sentAt) : null,
  };
}

const include = { createdBy: { select: { id: true, fullName: true } } } as const;

/** Whether outbound email is set up. Drives the setup notice on the Communication page. */
messagesRouter.get(
  '/email-config',
  requireAnyPermission('messages.read', 'messages.send'),
  (_req, res) => {
    ok(res, emailConfig());
  },
);

/** Checks the SMTP settings without sending anything. */
messagesRouter.post('/email-config/test', requirePermission('messages.send'), async (_req, res) => {
  await verifyEmailTransport();
  ok(res, { ok: true });
});

/**
 * Count and list the recipients an audience resolves to, and show the message as the
 * first of them would receive it. Read-only; it is a POST because the filters and the
 * message text are a body, not a query string.
 */
messagesRouter.post('/audience', requirePermission('messages.send'), async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(messageAudienceRequestSchema, req.body);
  const resolved = await resolveRecipients(ctx, input.audience, input.filters, input.recipientIds);
  const overLimit = overRecipientLimit(resolved);
  const recipients = resolved.slice(0, MESSAGE_MAX_RECIPIENTS);
  const deliverable = recipients.filter((r) => r.email);
  const first = deliverable[0];
  const preview: MessageAudiencePreviewDto = {
    total: recipients.length,
    deliverable: deliverable.length,
    withoutEmail: recipients.length - deliverable.length,
    recipients: recipients.slice(0, MESSAGE_RECIPIENT_PREVIEW_LIMIT).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      detail: r.detail,
    })),
    truncated: recipients.length > MESSAGE_RECIPIENT_PREVIEW_LIMIT,
    sample:
      first && (input.subject || input.body)
        ? {
            name: first.name,
            email: first.email!,
            subject: renderTemplate(input.subject ?? '', first.values),
            body: renderTemplate(input.body ?? '', first.values),
          }
        : null,
    overLimit,
    limit: MESSAGE_MAX_RECIPIENTS,
  };
  ok(res, preview);
});

messagesRouter.get('/', requirePermission('messages.read'), async (req, res) => {
  const query = parse(messageListQuerySchema, req.query);
  const where: Prisma.MessageWhereInput = {
    ...(query.audience ? { audience: query.audience } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { subject: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const sort = orderBy<Prisma.MessageOrderByWithRelationInput>(
    query.sort,
    {
      createdAt: (dir) => ({ createdAt: dir }),
      subject: (dir) => ({ subject: dir }),
      recipientCount: (dir) => ({ recipientCount: dir }),
    },
    { createdAt: 'desc' },
  );
  const [rows, total] = await Promise.all([
    prisma.message.findMany({ where, orderBy: sort, include, ...pageWindow(query) }),
    prisma.message.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

messagesRouter.get('/:id', requirePermission('messages.read'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const row = await prisma.message.findUnique({
    where: { id },
    include: { ...include, recipients: { orderBy: [{ status: 'asc' }, { name: 'asc' }] } },
  });
  if (!row) throw notFound('The message');
  const detail: MessageDetailDto = {
    ...toDto(row),
    recipients: row.recipients.map(toRecipientDto),
  };
  ok(res, detail);
});

/** Sending reaches people outside the company, so it gets its own tighter limit. */
const sendLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(
      new AppError(
        'RATE_LIMITED',
        'Too many messages have been sent from here in the last hour. Wait a while and try again.',
      ),
    ),
});

messagesRouter.post(
  '/',
  requirePermission('messages.send'),
  sendLimiter,
  idempotent,
  async (req, res) => {
    const ctx = getAuth(req);
    const input = parse(messageInputSchema, req.body);
    assertEmailAvailable();

    const resolved = await resolveRecipients(
      ctx,
      input.audience,
      input.filters,
      input.recipientIds,
    );
    if (overRecipientLimit(resolved)) {
      throw invalidState(
        `This would send to more than ${MESSAGE_MAX_RECIPIENTS} recipients. Narrow the audience with the filters, or send it in smaller groups.`,
      );
    }
    const deliverable = resolved.filter((r) => r.email);
    if (deliverable.length === 0) {
      const message =
        resolved.length === 0
          ? 'No one matches this audience. Change the filters and try again.'
          : 'None of the selected recipients has an email address on record, so there is no one to send to.';
      throw new AppError('VALIDATION_FAILED', message, { recipientIds: message });
    }

    const message = await prisma.$transaction(async (tx) => {
      const row = await tx.message.create({
        data: {
          audience: input.audience,
          filters: input.filters as Prisma.InputJsonValue,
          subject: input.subject,
          body: input.body,
          status: 'queued',
          recipientCount: resolved.length,
          skippedCount: resolved.length - deliverable.length,
          createdById: ctx.profileId,
          recipients: { createMany: { data: recipientCreateData(resolved) } },
        },
        include,
      });
      await recordAudit(tx, actorFrom(req), {
        action: 'message.sent',
        entityType: 'message',
        entityId: row.id,
        summary: `Message "${row.subject}" queued for ${deliverable.length} recipient(s)`,
        changes: {
          audience: input.audience,
          filters: input.filters,
          recipients: deliverable.length,
          withoutEmail: resolved.length - deliverable.length,
        } as Prisma.InputJsonValue,
      });
      return row;
    });

    // Delivery continues after the response; the page follows the per-recipient progress.
    void dispatchMessage(message.id).catch((err: unknown) =>
      logger.error({ err, messageId: message.id }, 'background dispatch failed'),
    );
    created(res, toDto(message));
  },
);

/** Try the failed recipients of a message again, leaving those already sent alone. */
messagesRouter.post('/:id/retry', requirePermission('messages.send'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  assertEmailAvailable();
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) throw notFound('The message');
  if (message.status === 'queued' || message.status === 'sending') {
    throw invalidState('This message is still being sent. Wait for it to finish before retrying.');
  }
  const retried = await prisma.messageRecipient.updateMany({
    where: { messageId: id, status: 'failed' },
    data: { status: 'pending', error: null },
  });
  if (retried.count === 0) {
    throw invalidState('There are no failed deliveries to retry for this message.');
  }
  await prisma.$transaction(async (tx) => {
    await recordAudit(tx, actorFrom(req), {
      action: 'message.retried',
      entityType: 'message',
      entityId: id,
      summary: `Retrying ${retried.count} failed delivery(ies) of "${message.subject}"`,
    });
  });
  await finaliseMessage(id);
  void dispatchMessage(id).catch((err: unknown) =>
    logger.error({ err, messageId: id }, 'background dispatch failed'),
  );
  const row = await prisma.message.findUniqueOrThrow({ where: { id }, include });
  ok(res, toDto(row));
});
