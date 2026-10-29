import type { PageMeta } from '@tsm/shared';
import { AppError } from './errors';

export interface PageArgs {
  page: number;
  pageSize: number;
}

export function pageWindow({ page, pageSize }: PageArgs) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta({ page, pageSize }: PageArgs, total: number): PageMeta {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Convert "field:dir" into a Prisma orderBy, accepting only whitelisted fields.
 * Values in the map may be a nested orderBy for relation sorting.
 */
export function orderBy<T>(
  sort: string | undefined,
  allowed: Record<string, (dir: 'asc' | 'desc') => T>,
  fallback: T,
): T {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':') as [string, 'asc' | 'desc'];
  const build = allowed[field];
  if (!build) throw new AppError('BAD_REQUEST', `Sorting by "${field}" is not supported.`);
  return build(dir);
}
