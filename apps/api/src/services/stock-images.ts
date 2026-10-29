import type { Request } from 'express';
import type { FileRecord, Prisma, StockItemImage } from '@prisma/client';
import {
  STOCK_IMAGE_MAX_BYTES,
  STOCK_IMAGE_MAX_PER_ITEM,
  STOCK_IMAGE_MIME_TYPES,
  type StockItemImageDto,
} from '@tsm/shared';
import { AppError, notFound } from '../lib/errors';
import { prisma, type Tx } from '../lib/prisma';
import { iso } from '../lib/serialize';
import { actorFrom, recordAudit } from './audit';
import { objectPath, removeObject, signedUrls, uploadObject, sniffMimeType } from './storage';

/**
 * Product photographs for stock items.
 *
 * The bytes go to a private Supabase Storage bucket; the browser only ever receives
 * short-lived signed URLs issued by the API, so an image is reachable only by someone
 * who may read the catalogue. The first image (lowest position) is the thumbnail.
 */

const IMAGE_URL_TTL_SECONDS = 60 * 60;

const WRONG_TYPE = `Use PNG, JPEG or WebP images of ${STOCK_IMAGE_MAX_BYTES / 1024 / 1024} MB or less.`;

export const imageInclude = { file: true } as const;
type ImageRow = StockItemImage & { file: FileRecord };

/** Signs every image of one or more items in as few storage calls as possible. */
async function urlsFor(files: FileRecord[]) {
  const byBucket = new Map<string, string[]>();
  for (const file of files) {
    if (file.deletedAt) continue;
    byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.path]);
  }
  const signed = new Map<string, string>();
  await Promise.all(
    [...byBucket].map(async ([bucket, paths]) => {
      const urls = await signedUrls(bucket, paths, IMAGE_URL_TTL_SECONDS);
      for (const [path, url] of urls) signed.set(`${bucket}:${path}`, url);
    }),
  );
  return signed;
}

function toDto(row: ImageRow, urls: Map<string, string>, isPrimary: boolean): StockItemImageDto {
  return {
    id: row.id,
    url: urls.get(`${row.file.bucket}:${row.file.path}`) ?? null,
    originalName: row.file.originalName,
    sizeBytes: row.file.sizeBytes,
    position: row.position,
    isPrimary,
    createdAt: iso(row.createdAt),
  };
}

async function loadImages(itemId: string): Promise<ImageRow[]> {
  return prisma.stockItemImage.findMany({
    where: { itemId },
    include: imageInclude,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function listImages(itemId: string): Promise<StockItemImageDto[]> {
  const rows = await loadImages(itemId);
  const urls = await urlsFor(rows.map((r) => r.file));
  return rows.map((row, index) => toDto(row, urls, index === 0));
}

/**
 * Thumbnail URL per item for list pages. Pass the first image of each item (Prisma
 * `take: 1` on the include) so one storage call covers the whole page.
 */
export async function thumbnailUrls(
  items: { id: string; images: { file: Pick<FileRecord, 'bucket' | 'path' | 'deletedAt'> }[] }[],
) {
  const files = items.flatMap((item) =>
    item.images[0] ? [item.images[0].file as FileRecord] : [],
  );
  const urls = await urlsFor(files);
  const byItem = new Map<string, string | null>();
  for (const item of items) {
    const file = item.images[0]?.file;
    byItem.set(item.id, file ? (urls.get(`${file.bucket}:${file.path}`) ?? null) : null);
  }
  return byItem;
}

/** Renumber from zero in the given order, so positions stay a gap-free sequence. */
async function renumber(tx: Tx, ids: string[]) {
  for (const [index, id] of ids.entries()) {
    await tx.stockItemImage.update({ where: { id }, data: { position: index } });
  }
}

export async function addImages(
  req: Request,
  itemId: string,
  profileId: string,
  files: { buffer: Buffer; size: number; originalname: string }[],
): Promise<StockItemImageDto[]> {
  if (files.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Choose at least one image to upload.', {
      files: 'Choose at least one image to upload.',
    });
  }
  const item = await prisma.stockItem.findUnique({
    where: { id: itemId },
    select: { id: true, sku: true },
  });
  if (!item) throw notFound('The stock item');

  const existing = await prisma.stockItemImage.aggregate({
    where: { itemId },
    _count: true,
    _max: { position: true },
  });
  if (existing._count + files.length > STOCK_IMAGE_MAX_PER_ITEM) {
    const left = Math.max(0, STOCK_IMAGE_MAX_PER_ITEM - existing._count);
    const message =
      left === 0
        ? `This item already has the maximum of ${STOCK_IMAGE_MAX_PER_ITEM} images. Remove one before adding another.`
        : `You can add ${left} more image(s): an item may have at most ${STOCK_IMAGE_MAX_PER_ITEM}.`;
    throw new AppError('VALIDATION_FAILED', message, { files: message });
  }

  // Validate every file before uploading any, so a rejected batch leaves nothing behind.
  const checked = files.map((file) => {
    const mimeType = sniffMimeType(file.buffer);
    if (!mimeType || !(STOCK_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new AppError('VALIDATION_FAILED', WRONG_TYPE, { files: WRONG_TYPE });
    }
    return { ...file, mimeType };
  });

  const uploaded: { bucket: string; path: string; mimeType: string; size: number; name: string }[] =
    [];
  try {
    for (const file of checked) {
      const { bucket, path } = await uploadObject(
        objectPath('stock-item-image', file.mimeType),
        file.buffer,
        file.mimeType,
      );
      uploaded.push({
        bucket,
        path,
        mimeType: file.mimeType,
        size: file.size,
        name: file.originalname.slice(0, 200),
      });
    }
    await prisma.$transaction(async (tx) => {
      let position = (existing._max.position ?? -1) + 1;
      for (const object of uploaded) {
        const record = await tx.fileRecord.create({
          data: {
            bucket: object.bucket,
            path: object.path,
            originalName: object.name,
            mimeType: object.mimeType,
            sizeBytes: object.size,
            category: 'stock_item_image',
            ownerType: 'stock_item',
            ownerId: itemId,
            uploadedById: profileId,
          },
        });
        await tx.stockItemImage.create({
          data: { itemId, fileId: record.id, position: position++ },
        });
      }
      await recordAudit(tx, actorFrom(req), {
        action: 'stock_item.images_added',
        entityType: 'stock_item',
        entityId: itemId,
        summary: `${uploaded.length} image(s) added to stock item ${item.sku}`,
        changes: { added: uploaded.map((o) => o.name) } as Prisma.InputJsonValue,
      });
    });
  } catch (err) {
    // Never leave orphaned objects in the bucket when the database write fails.
    await Promise.all(uploaded.map((o) => removeObject(o.bucket, o.path)));
    throw err;
  }
  return listImages(itemId);
}

export async function removeImage(req: Request, itemId: string, imageId: string) {
  const image = await prisma.stockItemImage.findFirst({
    where: { id: imageId, itemId },
    include: { item: { select: { sku: true } }, file: true },
  });
  if (!image) throw notFound('The image');

  await prisma.$transaction(async (tx) => {
    await tx.stockItemImage.delete({ where: { id: imageId } });
    await tx.fileRecord.update({ where: { id: image.fileId }, data: { deletedAt: new Date() } });
    const remaining = await tx.stockItemImage.findMany({
      where: { itemId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    await renumber(
      tx,
      remaining.map((r) => r.id),
    );
    await recordAudit(tx, actorFrom(req), {
      action: 'stock_item.image_removed',
      entityType: 'stock_item',
      entityId: itemId,
      summary: `Image "${image.file.originalName}" removed from stock item ${image.item.sku}`,
    });
  });
  await removeObject(image.file.bucket, image.file.path);
  return listImages(itemId);
}

/** Move an image to the front, making it the item's thumbnail. */
export async function makeImagePrimary(req: Request, itemId: string, imageId: string) {
  const rows = await prisma.stockItemImage.findMany({
    where: { itemId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { item: { select: { sku: true } }, file: { select: { originalName: true } } },
  });
  const target = rows.find((r) => r.id === imageId);
  if (!target) throw notFound('The image');
  if (rows[0]?.id === imageId) return listImages(itemId);

  await prisma.$transaction(async (tx) => {
    await renumber(tx, [imageId, ...rows.filter((r) => r.id !== imageId).map((r) => r.id)]);
    await recordAudit(tx, actorFrom(req), {
      action: 'stock_item.image_primary_changed',
      entityType: 'stock_item',
      entityId: itemId,
      summary: `Main image of stock item ${target.item.sku} set to "${target.file.originalName}"`,
    });
  });
  return listImages(itemId);
}
