import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  forgotPasswordSchema,
  isEmailIdentifier,
  loginSchema,
  type LoginResultDto,
} from '@tsm/shared';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';

/**
 * Public sign-in endpoints. Supabase Auth remains the identity provider and checks the
 * password; these routes only let people sign in with a username as well as an email.
 *
 * The same response is returned for an unknown username and a wrong password, so the
 * endpoints cannot be used to discover which accounts exist.
 */
export const authRouter = Router();

export const INVALID_CREDENTIALS =
  "We couldn't sign you in with those details. Check your username or email and password and try again.";

const limitHandler = (message: string) => (_req: unknown, _res: unknown, next: (err: unknown) => void) =>
  next(new AppError('RATE_LIMITED', message));

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Per network address and account, so one person's typos don't lock out an office.
  keyGenerator: (req) =>
    `${req.ip}:${String((req.body as { identifier?: unknown } | undefined)?.identifier ?? '').trim().toLowerCase()}`,
  handler: limitHandler('Too many sign-in attempts. Wait 15 minutes and try again.'),
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitHandler('Too many reset requests. Wait a few minutes and try again.'),
});

/** A fresh client per call: a signed-in client must never be shared between users. */
function publicAuthClient() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Resolve a username or email to the email of an application account. */
async function resolveEmail(identifier: string) {
  const value = identifier.trim().toLowerCase();
  const profile = await prisma.userProfile.findUnique({
    where: isEmailIdentifier(value) ? { email: value } : { username: value },
    select: { email: true, isActive: true },
  });
  return profile;
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = parse(loginSchema, req.body);
  const profile = await resolveEmail(identifier);
  if (!profile) throw new AppError('INVALID_CREDENTIALS', INVALID_CREDENTIALS);

  const { data, error } = await publicAuthClient().auth.signInWithPassword({
    email: profile.email,
    password,
  });
  if (error || !data.session) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message ?? '')) {
      throw new AppError('INVALID_CREDENTIALS', INVALID_CREDENTIALS);
    }
    if (code === 'user_banned') {
      throw new AppError(
        'ACCOUNT_INACTIVE',
        'Your account has been deactivated. Contact your administrator if you believe this is a mistake.',
      );
    }
    if (code === 'email_not_confirmed') {
      throw new AppError(
        'INVALID_STATE',
        'Your account has not been activated yet. Ask your administrator to check your account.',
      );
    }
    if ((error as { status?: number } | null)?.status === 429) {
      throw new AppError('RATE_LIMITED', 'Too many sign-in attempts. Wait a few minutes and try again.');
    }
    logger.error({ err: error }, 'supabase sign-in failed');
    throw new AppError('SERVICE_UNAVAILABLE', "We couldn't sign you in right now. Try again in a moment.");
  }

  const result: LoginResultDto = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
  ok(res, result);
});

/**
 * Records a request for an administrator to reset the password. There is no email: the admin
 * sees the request on the Users page and sets a temporary password. The answer is identical
 * whether or not the details matched an account.
 */
authRouter.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email, username } = parse(forgotPasswordSchema, req.body);
  const profile = await prisma.userProfile.findFirst({
    where: { email, username, isActive: true },
    select: { id: true, fullName: true, email: true },
  });
  if (profile) {
    try {
      await prisma.$transaction(async (tx) => {
        const open = await tx.passwordResetRequest.findFirst({ where: { userId: profile.id, resolvedAt: null } });
        if (open) return;
        const request = await tx.passwordResetRequest.create({ data: { userId: profile.id } });
        await recordAudit(tx, actorFrom(req), {
          action: 'user.password_reset_requested',
          entityType: 'user',
          entityId: profile.id,
          summary: `${profile.fullName} (${profile.email}) asked for a password reset`,
          changes: { requestId: request.id },
        });
      });
    } catch (err) {
      // Logged, not returned: the response must not reveal whether the account exists.
      logger.warn({ err }, 'password reset request failed');
    }
  }
  ok(res, { sent: true });
});
