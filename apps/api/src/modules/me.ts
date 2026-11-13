import { Router } from 'express';
import { DEFAULT_USER_PASSWORD, newPasswordSchema, profileUpdateSchema, type MeDto } from '@tsm/shared';
import rateLimit from 'express-rate-limit';
import { AppError, invalidState } from '../lib/errors';
import { logger } from '../lib/logger';
import { supabaseAdmin } from '../lib/supabase';
import { getAuth, type AuthContext } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { actorFrom, diff, recordAudit } from '../services/audit';
import { companyLogoUrl } from './company';

export const meRouter = Router();

async function buildMe(ctx: AuthContext): Promise<MeDto> {
  const [profile, company] = await Promise.all([
    prisma.userProfile.findUniqueOrThrow({
      where: { id: ctx.profileId },
      include: {
        roles: { include: { role: { select: { id: true, key: true, name: true } } } },
        branches: {
          where: { branch: { isActive: true } },
          include: { branch: { select: { id: true, code: true, name: true } } },
        },
      },
    }),
    prisma.companyProfile.findFirst({ include: { logo: true } }),
  ]);
  return {
    user: {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      fullName: profile.fullName,
      phone: profile.phone,
      roles: profile.roles.map((r) => r.role),
      branches: profile.branches.map((b) => b.branch),
    },
    permissions: [...ctx.permissions].sort(),
    allBranches: ctx.allBranches,
    mustChangePassword: Boolean(ctx.mustChangePassword),
    company: company
      ? {
          name: company.name,
          defaultCurrency: company.defaultCurrency,
          logoUrl: await companyLogoUrl(company.logo),
        }
      : null,
  };
}

meRouter.get('/', async (req, res) => {
  ok(res, await buildMe(getAuth(req)));
});

/** Users may edit their own name and phone only; roles and branches are admin-managed. */
meRouter.patch('/', async (req, res) => {
  const ctx = getAuth(req);
  const input = parse(profileUpdateSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const before = await tx.userProfile.findUniqueOrThrow({ where: { id: ctx.profileId } });
    await tx.userProfile.update({
      where: { id: ctx.profileId },
      data: { fullName: input.fullName, phone: input.phone ?? null },
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: ctx.profileId,
      summary: `${input.fullName} updated their profile`,
      changes: diff(before, { fullName: input.fullName, phone: input.phone ?? null }, [
        'fullName',
        'phone',
      ]),
    });
  });
  ok(res, await buildMe(ctx));
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.')),
});

/**
 * The first-sign-in password change. Only available while the account still has the default
 * password; afterwards users change it from Account settings.
 */
meRouter.post('/password', passwordLimiter, async (req, res) => {
  const ctx = getAuth(req);
  const { password } = parse(newPasswordSchema, req.body);
  if (!ctx.mustChangePassword) throw invalidState('Your password has already been set. Change it from Account settings.');
  if (password === DEFAULT_USER_PASSWORD) {
    const message = 'Choose a password that is different from the default one.';
    throw new AppError('VALIDATION_FAILED', message, { password: message });
  }
  const { error } = await supabaseAdmin().auth.admin.updateUserById(ctx.authUserId, { password });
  if (error) {
    logger.error({ err: error }, 'first sign-in password change failed');
    throw new AppError('SERVICE_UNAVAILABLE', "We couldn't save your new password. Try again shortly.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.userProfile.update({ where: { id: ctx.profileId }, data: { mustChangePassword: false } });
    await recordAudit(tx, actorFrom(req), {
      action: 'user.password_changed',
      entityType: 'user',
      entityId: ctx.profileId,
      summary: `${ctx.fullName} chose a new password at first sign-in`,
    });
  });
  ok(res, { updated: true });
});
