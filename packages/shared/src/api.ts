/** Response envelopes shared by the API and the web client. */

export interface ApiSuccess<T> {
  data: T;
  meta?: PageMeta;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'SESSION_INVALID',
  'ACCOUNT_INACTIVE',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'DUPLICATE',
  'INVALID_STATE',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
