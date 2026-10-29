import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { supabaseAdmin } from '../lib/supabase';

/**
 * Supabase Storage access. Objects live in a private bucket; the browser never gets
 * the bucket credentials. Downloads are authorised by the API against the owning
 * record and served through short-lived signed URLs.
 */
const UPLOAD_FAILED =
  "We couldn't upload this document. Check the file format and size, then try again.";

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Object paths are generated server-side; user-supplied names never form the path. */
export function objectPath(category: string, mimeType: string) {
  const ext = EXTENSIONS[mimeType] ?? 'bin';
  const day = new Date().toISOString().slice(0, 10);
  return `${category}/${day}/${randomUUID()}.${ext}`;
}

export async function uploadObject(path: string, body: Buffer, contentType: string) {
  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: false });
  if (error) {
    logger.error({ err: error, path }, 'storage upload failed');
    throw new AppError('SERVICE_UNAVAILABLE', UPLOAD_FAILED);
  }
  return { bucket, path };
}

export async function signedUrl(bucket: string, path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    logger.warn({ err: error, path }, 'could not sign storage url');
    return null;
  }
  return data.signedUrl;
}

/**
 * Sign many objects of one bucket in a single call, for list pages that show thumbnails.
 * Paths that cannot be signed are left out of the returned map.
 */
export async function signedUrls(bucket: string, paths: string[], expiresInSeconds = 3600) {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrls([...new Set(paths)], expiresInSeconds);
  if (error || !data) {
    logger.warn({ err: error, count: paths.length }, 'could not sign storage urls');
    return urls;
  }
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/** Best-effort removal; failures are logged for the cleanup job rather than surfaced. */
export async function removeObject(bucket: string, path: string) {
  const { error } = await supabaseAdmin().storage.from(bucket).remove([path]);
  if (error) logger.warn({ err: error, path }, 'storage object removal failed');
  return !error;
}

/** Validate the leading bytes so a renamed file cannot pass as an image or PDF. */
export function sniffMimeType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
