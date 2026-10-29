import type { Response } from 'express';
import type { ApiSuccess, PageMeta } from '@tsm/shared';

export function ok<T>(res: Response, data: T, meta?: PageMeta, status = 200) {
  const body: ApiSuccess<T> = meta ? { data, meta } : { data };
  return res.status(status).json(body);
}

export const created = <T>(res: Response, data: T) => ok(res, data, undefined, 201);
