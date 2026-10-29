import { z } from 'zod';

/**
 * Usernames are stored lower-case and compared case-insensitively. Supabase Auth still
 * identifies the account by email; the API resolves a username to its email at sign-in.
 */
export const usernameSchema = z
  .string({ required_error: 'Username is required.' })
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters.')
  .max(32, 'Use 32 characters or fewer.')
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'Use letters, numbers, dots, hyphens or underscores, starting with a letter or number.',
  );

/** A username or an email address; an "@" marks it as an email. */
const loginIdentifier = z
  .string()
  .trim()
  .min(1, 'Enter your username or email address.')
  .max(254, 'Use 254 characters or fewer.');

export const isEmailIdentifier = (identifier: string) => identifier.includes('@');

export const loginSchema = z.object({
  identifier: loginIdentifier,
  password: z.string().min(1, 'Password is required.').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Session returned by POST /auth/login; the browser hands it to supabase.auth.setSession. */
export interface LoginResultDto {
  accessToken: string;
  refreshToken: string;
}

/** Both must match the same account, so the form can't be used to probe for accounts. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  username: z.string().trim().toLowerCase().min(1, 'Enter your username.').max(32, 'Use 32 characters or fewer.'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const passwordPolicy = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number.');

export const newPasswordSchema = z
  .object({
    password: passwordPolicy,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
