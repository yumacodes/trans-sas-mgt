import { z } from 'zod';
import { isMoneyString } from '../money';

/** Trimmed text; empty strings become null so optional columns stay NULL. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const requiredText = (label: string, max = 200) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `Use ${max} characters or fewer.`);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address.')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === '' || /^[+()\d\s.-]{5,40}$/.test(v), 'Enter a valid telephone number.')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

/** Non-negative monetary amount as a decimal string. */
export const moneyString = (label: string, { allowZero = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v !== '', `${label} is required.`)
    .refine(isMoneyString, `${label} must be a valid amount.`)
    .refine(
      (v) => (allowZero ? !v.startsWith('-') : !v.startsWith('-') && /[1-9]/.test(v)),
      `${label} must be ${allowZero ? 'zero or more' : 'greater than zero'}.`,
    );

export const optionalMoneyString = (label: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) =>
      v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim(),
    )
    .refine((v) => v === null || isMoneyString(v), `${label} must be a valid amount.`)
    .refine((v) => v === null || !v.startsWith('-'), `${label} must be zero or more.`);

export const uuid = z.string().uuid('Invalid identifier.');

/** Business date in YYYY-MM-DD form (no time component). */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.');

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .string()
    .regex(/^[a-zA-Z_.]+:(asc|desc)$/)
    .optional(),
  q: z.string().trim().max(200).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
