import { Prisma } from '@prisma/client';
import type { ErrorCode } from '@tsm/shared';
import { ZodError } from 'zod';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  SESSION_INVALID: 401,
  ACCOUNT_INACTIVE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE: 409,
  INVALID_STATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** An error whose message is safe to show to business users. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.status = STATUS_BY_CODE[code];
  }
}

export const MESSAGES = {
  forbidden:
    "You don't have permission to perform this action. Contact your administrator if you believe you need access.",
  validation: 'Some required information is missing or invalid. Review the highlighted fields and try again.',
  internal:
    'Something went wrong on our side and the operation was not completed. Try again, and contact support if it keeps happening.',
} as const;

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} could not be found. It may have been removed.`);

export const forbidden = () => new AppError('FORBIDDEN', MESSAGES.forbidden);

export const invalidState = (message: string) => new AppError('INVALID_STATE', message);

export function fieldsFromZod(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Translate known library errors into AppErrors. Unique-constraint violations become
 * DUPLICATE with the offending field highlighted when a friendly message is supplied.
 */
export function toAppError(err: unknown, duplicateMessages: Record<string, string> = {}): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new AppError('VALIDATION_FAILED', MESSAGES.validation, fieldsFromZod(err));
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = err.meta?.target;
        const fieldList = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
        const field = fieldList.find((f) => duplicateMessages[f]) ?? fieldList[0];
        const message =
          (field && duplicateMessages[field]) ?? 'A record with these details already exists.';
        return new AppError('DUPLICATE', message, field ? { [field]: message } : undefined);
      }
      case 'P2025':
        return new AppError('NOT_FOUND', 'The record could not be found. It may have been removed.');
      case 'P2003':
        return new AppError('CONFLICT', 'This change refers to a record that does not exist or is still in use.');
      case 'P2034':
        return new AppError('CONFLICT', 'Another user changed this record at the same time. Reload and try again.');
    }
  }
  return null;
}

/** Run a database operation, mapping unique-constraint errors to friendly messages. */
export async function withFriendlyErrors<T>(
  fn: () => Promise<T>,
  duplicateMessages: Record<string, string>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = toAppError(err, duplicateMessages);
    if (mapped) throw mapped;
    throw err;
  }
}
