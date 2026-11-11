import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  PROFORMA_EMAIL_MAX_FILES,
  PROFORMA_EMAIL_MAX_FILE_BYTES,
  proformaEmailSchema,
  uuid,
  type Permission,
} from '@tsm/shared';
import { requirePermission } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from './audit';
import { EMAIL_NOT_CONFIGURED, emailConfigured, sendEmail } from './email';

/**
 * "Email this document" for any record with a PDF: the user writes the message, the PDF
 * is attached when asked, and extra files can be added. Nothing is reported as sent
 * until the mail server has accepted it.
 */

const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|scr|msi|js|jse|vbs|ps1|jar|dll|sh)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFORMA_EMAIL_MAX_FILE_BYTES, files: PROFORMA_EMAIL_MAX_FILES },
});

export function acceptEmailFiles(req: Request, res: Response, next: NextFunction) {
  upload.array('files', PROFORMA_EMAIL_MAX_FILES)(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const limit = Math.round(PROFORMA_EMAIL_MAX_FILE_BYTES / 1024 / 1024);
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? `Each attachment must be ${limit} MB or smaller.` : `Attach up to ${PROFORMA_EMAIL_MAX_FILES} files.`;
      return next(new AppError('VALIDATION_FAILED', message, { files: message }));
    }
    next(err);
  });
}

export const documentEmailLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('RATE_LIMITED', 'Too many emails have been sent from here in the last hour. Wait a while and try again.')),
});

export interface EmailableDocument {
  number: string;
  recipientName: string;
  pdf: () => Promise<Buffer>;
}

/** Route handlers for `POST /:id/email` on a document router. */
export function documentEmailRoute(opts: {
  permission: Permission;
  entityType: string;
  load: (id: string) => Promise<EmailableDocument>;
}): RequestHandler[] {
  return [
    requirePermission(opts.permission),
    documentEmailLimiter,
    acceptEmailFiles,
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const input = parse(proformaEmailSchema, req.body);
      if (!emailConfigured()) throw new AppError('SERVICE_UNAVAILABLE', EMAIL_NOT_CONFIGURED);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const blocked = files.find((f) => BLOCKED_EXTENSIONS.test(f.originalname));
      if (blocked) {
        const message = `"${blocked.originalname}" can't be attached because executable and script files are not allowed.`;
        throw new AppError('VALIDATION_FAILED', message, { files: message });
      }
      const doc = await opts.load(id);
      const attachments = files.map((f) => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }));
      if (input.attachInvoice) {
        attachments.unshift({ filename: `${doc.number}.pdf`, content: await doc.pdf(), contentType: 'application/pdf' });
      }
      await sendEmail({ to: input.to, toName: doc.recipientName, subject: input.subject, text: input.body, attachments });
      await recordAudit(prisma, actorFrom(req), {
        action: `${opts.entityType}.emailed`,
        entityType: opts.entityType,
        entityId: id,
        summary: `${doc.number} emailed to ${input.to} with ${attachments.length} attachment(s)`,
      });
      ok(res, { sent: true });
    },
  ];
}
