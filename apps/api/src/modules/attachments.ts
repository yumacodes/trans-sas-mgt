import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_OWNER_TYPES, uuid, type AttachmentDto, type AttachmentOwnerType, type Permission } from '@tsm/shared';
import { can, getAuth, type AuthContext } from '../middleware/auth';
import { AppError, forbidden, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { canAccessBranch } from '../services/branch-scope';
import { objectPath, removeObject, signedUrl, sniffMimeType, uploadObject } from '../services/storage';

/**
 * Supporting documents on business records (award letters, supplier invoices, proof of
 * delivery). Access follows the record: you can see a record's files only if you can see
 * the record, in its branch. Files are private and served through short-lived links.
 */
export const attachmentsRouter = Router();

type Owner = { read: Permission; manage: Permission; branchOf: (id: string) => Promise<{ branchId: string | null } | null> };

const OWNERS: Record<AttachmentOwnerType, Owner> = {
  proforma: { read: 'proformas.read', manage: 'proformas.manage', branchOf: (id) => prisma.proforma.findUnique({ where: { id }, select: { branchId: true } }) },
  tender: { read: 'tenders.read', manage: 'tenders.manage', branchOf: (id) => prisma.tender.findUnique({ where: { id }, select: { branchId: true } }) },
  acceptance: { read: 'acceptance.read', manage: 'acceptance.manage', branchOf: (id) => prisma.acceptanceLetter.findUnique({ where: { id }, select: { branchId: true } }) },
  sale: { read: 'sales.read', manage: 'sales.manage', branchOf: (id) => prisma.sale.findUnique({ where: { id }, select: { branchId: true } }) },
  waybill: { read: 'waybills.read', manage: 'waybills.manage', branchOf: (id) => prisma.waybill.findUnique({ where: { id }, select: { branchId: true } }) },
  payment: { read: 'payments.read', manage: 'payments.record', branchOf: (id) => prisma.payment.findUnique({ where: { id }, select: { branchId: true } }) },
  purchase: { read: 'purchases.read', manage: 'purchases.manage', branchOf: (id) => prisma.purchase.findUnique({ where: { id }, select: { branchId: true } }) },
  expense: { read: 'expenses.read', manage: 'expenses.manage', branchOf: (id) => prisma.expense.findUnique({ where: { id }, select: { branchId: true } }) },
  client: { read: 'clients.read', manage: 'clients.update', branchOf: (id) => prisma.client.findUnique({ where: { id }, select: { branchId: true } }) },
  supplier: { read: 'purchases.read', manage: 'purchases.manage', branchOf: async (id) => ((await prisma.supplier.count({ where: { id } })) ? { branchId: null } : null) },
};

const ownerQuery = z.object({ ownerType: z.enum(ATTACHMENT_OWNER_TYPES), ownerId: uuid });

/** Throws unless the user may see (or change) this record's files. */
async function checkOwner(ctx: AuthContext, ownerType: AttachmentOwnerType, ownerId: string, manage: boolean) {
  const owner = OWNERS[ownerType];
  if (!can(ctx, owner.read) || (manage && !can(ctx, owner.manage))) throw forbidden();
  const row = await owner.branchOf(ownerId);
  if (!row || !canAccessBranch(ctx, row.branchId)) throw notFound('The record');
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 } });
function acceptFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = `Files must be ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB or smaller.`;
      return next(new AppError('VALIDATION_FAILED', message, { file: message }));
    }
    next(err);
  });
}

async function toDtos(rows: { id: string; bucket: string; path: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: Date; uploadedBy: { fullName: string } }[]) {
  return Promise.all(
    rows.map(async (r): Promise<AttachmentDto> => ({
      id: r.id,
      name: r.originalName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      uploadedBy: r.uploadedBy.fullName,
      createdAt: iso(r.createdAt),
      url: await signedUrl(r.bucket, r.path, 600),
    })),
  );
}

attachmentsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const { ownerType, ownerId } = parse(ownerQuery, req.query);
  await checkOwner(ctx, ownerType, ownerId, false);
  const rows = await prisma.fileRecord.findMany({
    where: { ownerType, ownerId, category: 'attachment', deletedAt: null },
    include: { uploadedBy: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, await toDtos(rows));
});

attachmentsRouter.post('/', acceptFile, async (req, res) => {
  const ctx = getAuth(req);
  const { ownerType, ownerId } = parse(ownerQuery, req.body);
  await checkOwner(ctx, ownerType, ownerId, true);
  const file = req.file;
  if (!file) throw new AppError('VALIDATION_FAILED', 'Choose a file to attach.', { file: 'Choose a file to attach.' });
  // The contents are checked, not the name, so a renamed file can't pass as a PDF or image.
  const mimeType = sniffMimeType(file.buffer);
  if (!mimeType) {
    const message = "We couldn't upload this document. Attach a PDF, PNG, JPEG or WebP file.";
    throw new AppError('VALIDATION_FAILED', message, { file: message });
  }
  const stored = await uploadObject(objectPath('attachments', mimeType), file.buffer, mimeType);
  const row = await prisma.$transaction(async (tx) => {
    const record = await tx.fileRecord.create({
      data: {
        bucket: stored.bucket,
        path: stored.path,
        originalName: file.originalname.slice(0, 200),
        mimeType,
        sizeBytes: file.size,
        category: 'attachment',
        ownerType,
        ownerId,
        uploadedById: ctx.profileId,
      },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'attachment.added',
      entityType: ownerType,
      entityId: ownerId,
      summary: `Attached ${record.originalName}`,
    });
    return record;
  });
  created(res, (await toDtos([row]))[0]);
});

attachmentsRouter.delete('/:id', async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const record = await prisma.fileRecord.findUnique({ where: { id } });
  if (!record || record.category !== 'attachment' || record.deletedAt || !record.ownerId) throw notFound('The file');
  await checkOwner(ctx, record.ownerType as AttachmentOwnerType, record.ownerId, true);
  await prisma.$transaction(async (tx) => {
    await tx.fileRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, actorFrom(req), {
      action: 'attachment.removed',
      entityType: record.ownerType,
      entityId: record.ownerId,
      summary: `Removed ${record.originalName}`,
    });
  });
  await removeObject(record.bucket, record.path);
  ok(res, { removed: true });
});
