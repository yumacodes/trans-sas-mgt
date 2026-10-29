import type { z, ZodTypeAny } from 'zod';
import { AppError, fieldsFromZod, MESSAGES } from './errors';

/** Parse untrusted input; failures become a 422 with per-field messages. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', MESSAGES.validation, fieldsFromZod(result.error));
  }
  return result.data;
}
