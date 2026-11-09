import {
  IDEMPOTENCY_HEADER,
  type ApiErrorBody,
  type ErrorCode,
  type PageMeta,
} from '@tsm/shared';
import { supabase } from './supabase';

export const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

export const NETWORK_ERROR_MESSAGE =
  "We couldn't complete this request because the connection was interrupted. Check your connection and try again.";

const FALLBACK_MESSAGES: Partial<Record<ErrorCode, string>> = {
  FORBIDDEN:
    "You don't have permission to perform this action. Contact your administrator if you believe you need access.",
  VALIDATION_FAILED:
    'Some required information is missing. Review the highlighted fields and try again.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again to continue.',
  SESSION_INVALID: 'Your session has ended. Sign in again to continue.',
  ACCOUNT_INACTIVE: 'Your account has been deactivated. Contact your administrator.',
  NOT_FOUND: "We couldn't find that record. It may have been removed or you may not have access.",
  RATE_LIMITED: 'Too many requests in a short time. Wait a moment and try again.',
  INTERNAL: 'Something went wrong on our side. Your changes were not saved. Try again shortly.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Try again shortly.',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK';
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(opts: {
    status: number;
    code: ErrorCode | 'NETWORK';
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.fields = opts.fields;
    this.requestId = opts.requestId;
  }

  /** True when the request may succeed if simply retried (network or transient server error). */
  get retryable() {
    return this.code === 'NETWORK' || this.status >= 500 || this.code === 'RATE_LIMITED';
  }
}

/** Converts any thrown value into a message suitable for business users. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something unexpected happened. Your changes may not have been saved. Try again.';
}

export async function parseErrorResponse(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const err = body?.error;
  const code: ErrorCode =
    err?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : res.status === 403 ? 'FORBIDDEN' : 'INTERNAL');
  return new ApiError({
    status: res.status,
    code,
    message: err?.message || FALLBACK_MESSAGES[code] || FALLBACK_MESSAGES.INTERNAL!,
    fields: err?.fields,
    requestId: err?.requestId,
  });
}

type AuthFailureListener = (error: ApiError) => void;
const authFailureListeners = new Set<AuthFailureListener>();

/** AuthProvider subscribes here to sign the user out when the API rejects the session. */
export function onAuthFailure(listener: AuthFailureListener) {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  formData?: FormData;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta;
}

export function buildQuery(query?: Record<string, QueryValue>) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
      method,
      headers,
      body,
      signal: opts.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError({ status: 0, code: 'NETWORK', message: NETWORK_ERROR_MESSAGE });
  }

  if (!res.ok) {
    const error = await parseErrorResponse(res);
    if (
      error.code === 'UNAUTHENTICATED' ||
      error.code === 'SESSION_INVALID' ||
      error.code === 'ACCOUNT_INACTIVE'
    ) {
      authFailureListeners.forEach((l) => l(error));
    }
    throw error;
  }

  if (res.status === 204) return { data: undefined as T };
  return (await res.json()) as ApiResult<T>;
}

/** Thin helpers returning only `data`; use `request` directly when `meta` is needed. */
export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>('GET', path, { query, signal }).then((r) => r.data),
  list: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T[]>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>('POST', path, { body, idempotencyKey }).then((r) => r.data),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('PATCH', path, { body }).then((r) => r.data),
  delete: <T>(path: string) => request<T>('DELETE', path).then((r) => r.data),
  upload: <T>(path: string, formData: FormData) =>
    request<T>('POST', path, { formData }).then((r) => r.data),
};

async function fetchFile(path: string): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers });
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK', message: NETWORK_ERROR_MESSAGE });
  }
  if (!res.ok) throw await parseErrorResponse(res);
  return res;
}

/**
 * Fetches a PDF with the signed-in user's session and opens the browser's print dialog for
 * it, using a hidden frame so the app stays where it is. Browsers that refuse to print a
 * framed PDF get it in a new tab instead, where it can be printed from the viewer.
 */
export async function printFile(path: string): Promise<void> {
  const res = await fetchFile(path);
  const url = URL.createObjectURL(new Blob([await res.blob()], { type: 'application/pdf' }));
  document.querySelector('iframe[data-print-frame]')?.remove();
  const frame = document.createElement('iframe');
  frame.dataset.printFrame = '';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    // Keep the frame alive long enough for the print dialog to read it.
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.append(frame);
}

/** Fetches a file with the signed-in user's session and saves it through the browser. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetchFile(path);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
