import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@tsm/shared';
import { AppError, MESSAGES, toAppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError('NOT_FOUND', 'The requested resource does not exist.'));
}

/**
 * Converts every error into the shared ApiErrorBody. Technical details are logged with
 * the request id; users receive a safe, actionable message and the id for support.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = String(req.id ?? '');
  let appError = toAppError(err);

  if (!appError) {
    const e = err as { type?: string; status?: number; code?: string };
    if (e?.type === 'entity.parse.failed') {
      appError = new AppError('BAD_REQUEST', 'The request body is not valid JSON.');
    } else if (e?.type === 'entity.too.large' || e?.code === 'LIMIT_FILE_SIZE') {
      appError = new AppError('PAYLOAD_TOO_LARGE', 'The submitted file or data is too large.');
    } else if (e?.code === 'LIMIT_FILE_COUNT' || e?.code === 'LIMIT_UNEXPECTED_FILE') {
      appError = new AppError(
        'VALIDATION_FAILED',
        'Too many files were attached to this request. Upload fewer files and try again.',
      );
    }
  }

  if (!appError) {
    logger.error({ err, requestId, method: req.method, url: req.originalUrl }, 'unhandled error');
    appError = new AppError('INTERNAL', MESSAGES.internal);
  } else if (appError.status >= 500) {
    logger.error({ err, requestId }, appError.message);
  }

  if (res.headersSent) return;
  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.fields ? { fields: appError.fields } : {}),
      requestId,
    },
  };
  res.status(appError.status).json(body);
}
