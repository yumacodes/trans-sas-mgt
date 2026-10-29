import { Router } from 'express';
import multer from 'multer';
import type { CompanyProfile, FileRecord, Prisma } from '@prisma/client';
import {
  companyProfileSchema,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  type CompanyProfileDto,
} from '@tsm/shared';
import { getAuth, requirePermission } from '../middleware/auth';
import { AppError, invalidState } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';
import { actorFrom, diff, recordAudit } from '../services/audit';
import { parseSettings } from '../services/company-settings';
import { objectPath, removeObject, signedUrl, sniffMimeType, uploadObject } from '../services/storage';

export const companyRouter = Router();

const LOGO_URL_TTL_SECONDS = 60 * 60;

export async function companyLogoUrl(logo: FileRecord | null) {
  if (!logo || logo.deletedAt) return null;
  return signedUrl(logo.bucket, logo.path, LOGO_URL_TTL_SECONDS);
}

async function toDto(company: CompanyProfile & { logo: FileRecord | null }): Promise<CompanyProfileDto> {
  return {
    id: company.id,
    name: company.name,
    legalName: company.legalName,
    email: company.email,
    phone: company.phone,
    website: company.website,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    region: company.region,
    country: company.country,
    taxId: company.taxId,
    registrationNumber: company.registrationNumber,
    defaultCurrency: company.defaultCurrency,
    settings: parseSettings(company.settings),
    logoUrl: await companyLogoUrl(company.logo),
    updatedAt: iso(company.updatedAt),
  };
}

async function loadCompany() {
  return prisma.companyProfile.findFirst({ include: { logo: true } });
}

/** Company details are used on every document, so any signed-in user may read them. */
companyRouter.get('/', async (_req, res) => {
  const company = await loadCompany();
  ok(res, company ? await toDto(company) : null);
});

const AUDITED_FIELDS = [
  'name',
  'legalName',
  'email',
  'phone',
  'website',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'country',
  'taxId',
  'registrationNumber',
  'defaultCurrency',
] as const;

companyRouter.put('/', requirePermission('company.manage'), async (req, res) => {
  const input = parse(companyProfileSchema, req.body);
  const { settings, ...fields } = input;
  const data = {
    ...fields,
    settings: settings as unknown as Prisma.InputJsonValue,
  };
  await prisma.$transaction(async (tx) => {
    const before = await tx.companyProfile.findFirst();
    if (before) {
      await tx.companyProfile.update({ where: { id: before.id }, data });
    } else {
      await tx.companyProfile.create({ data });
    }
    await recordAudit(tx, actorFrom(req), {
      action: before ? 'company.updated' : 'company.created',
      entityType: 'company',
      entityId: before?.id ?? null,
      summary: before ? 'Company profile updated' : 'Company profile created',
      changes: {
        ...(before ? diff(before, fields, [...AUDITED_FIELDS]) : {}),
        ...(JSON.stringify(before?.settings) !== JSON.stringify(settings)
          ? { settings: { from: before?.settings ?? null, to: settings } }
          : {}),
      } as Prisma.InputJsonValue,
    });
  });
  const company = await loadCompany();
  ok(res, await toDto(company!));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
});

companyRouter.post('/logo', requirePermission('company.manage'), upload.single('file'), async (req, res) => {
  const ctx = getAuth(req);
  const file = req.file;
  if (!file) throw new AppError('VALIDATION_FAILED', 'Choose an image file to upload.', { file: 'Choose an image file to upload.' });
  const detected = sniffMimeType(file.buffer);
  if (!detected || !(LOGO_MIME_TYPES as readonly string[]).includes(detected)) {
    const message = 'Upload a PNG, JPEG or WebP image of 2 MB or less.';
    throw new AppError('VALIDATION_FAILED', message, { file: message });
  }
  const company = await prisma.companyProfile.findFirst({ include: { logo: true } });
  if (!company) throw invalidState('Save the company profile before uploading a logo.');

  const { bucket, path } = await uploadObject(objectPath('company-logo', detected), file.buffer, detected);
  const previous = company.logo;
  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.fileRecord.create({
        data: {
          bucket,
          path,
          originalName: file.originalname.slice(0, 200),
          mimeType: detected,
          sizeBytes: file.size,
          category: 'company_logo',
          ownerType: 'company',
          ownerId: company.id,
          uploadedById: ctx.profileId,
        },
      });
      await tx.companyProfile.update({ where: { id: company.id }, data: { logoFileId: record.id } });
      if (previous) {
        await tx.fileRecord.update({ where: { id: previous.id }, data: { deletedAt: new Date() } });
      }
      await recordAudit(tx, actorFrom(req), {
        action: 'company.logo_updated',
        entityType: 'company',
        entityId: company.id,
        summary: 'Company logo updated',
      });
    });
  } catch (err) {
    // Do not leave an orphaned object behind when the database update fails.
    await removeObject(bucket, path);
    throw err;
  }
  if (previous) await removeObject(previous.bucket, previous.path);
  ok(res, await toDto((await loadCompany())!));
});

companyRouter.delete('/logo', requirePermission('company.manage'), async (req, res) => {
  const company = await prisma.companyProfile.findFirst({ include: { logo: true } });
  if (!company) throw invalidState('The company profile has not been set up yet.');
  const previous = company.logo;
  if (previous) {
    await prisma.$transaction(async (tx) => {
      await tx.companyProfile.update({ where: { id: company.id }, data: { logoFileId: null } });
      await tx.fileRecord.update({ where: { id: previous.id }, data: { deletedAt: new Date() } });
      await recordAudit(tx, actorFrom(req), {
        action: 'company.logo_removed',
        entityType: 'company',
        entityId: company.id,
        summary: 'Company logo removed',
      });
    });
    await removeObject(previous.bucket, previous.path);
  }
  ok(res, await toDto((await loadCompany())!));
});
