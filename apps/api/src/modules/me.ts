import { Router } from 'express';
import { profileUpdateSchema, type MeDto } from '@tsm/shared';
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
