import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Prisma } from '@prisma/client';
import {
  passwordPolicy,
  userAccessSchema,
  userCreateSchema,
  userListQuerySchema,
  userStatusSchema,
  userTemporaryPasswordSchema,
  userUpdateSchema,
  uuid,
  listQuerySchema,
  type PasswordResetRequestDto,
  type UserDto,
  type UserOptionDto,
} from '@tsm/shared';
import { getAuth, requireAnyPermission, requirePermission } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { AppError, invalidState, notFound, withFriendlyErrors } from '../lib/errors';
import { logger } from '../lib/logger';
import { orderBy, pageMeta, pageWindow } from '../lib/pagination';
import { prisma, type Tx } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { supabaseAdmin } from '../lib/supabase';
import { parse } from '../lib/validate';
import { actorFrom, auditInclude, diff, recordAudit, toAuditDto } from '../services/audit';
import { assertAdminRemains, lockAdminGuard } from '../services/admin-guard';

export const usersRouter = Router();

/** Supabase ban length used to block sign-in and token refresh for deactivated users. */
const DEACTIVATED_BAN = '876000h';

const userInclude = {
  roles: { include: { role: { select: { id: true, key: true, name: true } } } },
  branches: { include: { branch: { select: { id: true, code: true, name: true } } } },
} as const;

type UserRow = Prisma.UserProfileGetPayload<{ include: typeof userInclude }>;

function toDto(u: UserRow): UserDto {
  return {
    id: u.id,
    authUserId: u.authUserId,
    email: u.email,
    username: u.username,
    fullName: u.fullName,
    phone: u.phone,
    isActive: u.isActive,
    roles: u.roles.map((r) => r.role),
    branches: u.branches.map((b) => b.branch),
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

async function assertRolesAndBranches(tx: Tx, roleIds: string[], branchIds: string[]) {
  const [roles, branches] = await Promise.all([
    tx.role.count({ where: { id: { in: roleIds } } }),
    tx.branch.count({ where: { id: { in: branchIds }, isActive: true } }),
  ]);
  if (roles !== new Set(roleIds).size) {
    throw new AppError('VALIDATION_FAILED', 'One of the selected roles no longer exists.', {
      roleIds: 'One of the selected roles no longer exists.',
    });
  }
  if (branches !== new Set(branchIds).size) {
    throw new AppError('VALIDATION_FAILED', 'One of the selected branches is inactive or no longer exists.', {
      branchIds: 'One of the selected branches is inactive or no longer exists.',
    });
  }
}

/** Operations that create or reset sign-in credentials get a tighter limit. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('RATE_LIMITED', 'Too many account requests. Wait a few minutes and try again.')),
});

/** Names for user pickers (client owner, branch manager, message audience filters). */
usersRouter.get(
  '/options',
  requireAnyPermission('clients.read', 'branches.manage', 'users.manage', 'messages.send'),
  async (_req, res) => {
    const rows = await prisma.userProfile.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    ok<UserOptionDto[]>(res, rows);
  },
);

usersRouter.use(requirePermission('users.manage'));

usersRouter.get('/', async (req, res) => {
  const query = parse(userListQuerySchema, req.query);
  const where: Prisma.UserProfileWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.roleId ? { roles: { some: { roleId: query.roleId } } } : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { username: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const sort = orderBy<Prisma.UserProfileOrderByWithRelationInput>(
    query.sort,
    {
      fullName: (dir) => ({ fullName: dir }),
      email: (dir) => ({ email: dir }),
      username: (dir) => ({ username: dir }),
      createdAt: (dir) => ({ createdAt: dir }),
    },
    { fullName: 'asc' },
  );
  const [rows, total] = await Promise.all([
    prisma.userProfile.findMany({ where, orderBy: sort, include: userInclude, ...pageWindow(query) }),
    prisma.userProfile.count({ where }),
  ]);
  ok(res, rows.map(toDto), pageMeta(query, total));
});

/** Open password-reset requests, oldest first. The sidebar badge counts these. */
usersRouter.get('/reset-requests', async (_req, res) => {
  const rows = await prisma.passwordResetRequest.findMany({
    where: { resolvedAt: null, user: { isActive: true } },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, fullName: true, email: true, username: true } } },
  });
  ok<PasswordResetRequestDto[]>(
    res,
    rows.map((r) => ({ id: r.id, requestedAt: iso(r.createdAt), user: r.user })),
  );
});

usersRouter.get('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const user = await prisma.userProfile.findUnique({ where: { id }, include: userInclude });
  if (!user) throw notFound('The user');
  ok(res, toDto(user));
});

usersRouter.get('/:id/activity', requirePermission('audit.read'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const query = parse(listQuerySchema, req.query);
  const where: Prisma.AuditLogWhereInput = {
    OR: [{ actorId: id }, { entityType: 'user', entityId: id }],
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: auditInclude,
      ...pageWindow(query),
    }),
    prisma.auditLog.count({ where }),
  ]);
  ok(res, rows.map(toAuditDto), pageMeta(query, total));
});

const EMAIL_IN_USE = 'An account with this email address already exists.';
const USERNAME_IN_USE = 'This username is already taken. Choose a different one.';
const DUPLICATE = { email: EMAIL_IN_USE, username: USERNAME_IN_USE };

/**
 * Creates the Supabase Auth identity first (with the temporary password the administrator chose), then
 * the application profile. If the profile cannot be saved, the auth user is deleted
 * again so no orphaned login remains.
 */
usersRouter.post('/', idempotent, credentialLimiter, async (req, res) => {
  const input = parse(userCreateSchema, req.body);
  parse(passwordPolicy, input.temporaryPassword);

  const existing = await prisma.userProfile.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError('DUPLICATE', EMAIL_IN_USE, { email: EMAIL_IN_USE });
  if (await prisma.userProfile.findUnique({ where: { username: input.username } })) {
    throw new AppError('DUPLICATE', USERNAME_IN_USE, { username: USERNAME_IN_USE });
  }
  await prisma.$transaction((tx) => assertRolesAndBranches(tx, input.roleIds, input.branchIds));

  const admin = supabaseAdmin().auth.admin;
  const metadata = { full_name: input.fullName };
  const result = await admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (result.error || !result.data.user) {
    const status = (result.error as { status?: number } | null)?.status;
    const message = result.error?.message ?? '';
    if (status === 422 || /already (been )?registered|already exists/i.test(message)) {
      throw new AppError('DUPLICATE', EMAIL_IN_USE, { email: EMAIL_IN_USE });
    }
    logger.error({ err: result.error }, 'supabase user creation failed');
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'We could not create the sign-in account. Try again shortly.',
    );
  }
  const authUserId = result.data.user.id;

  try {
    const user = await withFriendlyErrors(() => prisma.$transaction(async (tx) => {
      const row = await tx.userProfile.create({
        data: {
          authUserId,
          email: input.email,
          username: input.username,
          fullName: input.fullName,
          phone: input.phone ?? null,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
          branches: { create: input.branchIds.map((branchId) => ({ branchId })) },
        },
        include: userInclude,
      });
      await recordAudit(tx, actorFrom(req), {
        action: 'user.created',
        entityType: 'user',
        entityId: row.id,
        summary: `User ${row.fullName} (${row.email}) created with a temporary password`,
        changes: { roles: row.roles.map((r) => r.role.key), branches: row.branches.map((b) => b.branch.code) },
      });
      return row;
    }), DUPLICATE);
    created(res, toDto(user));
  } catch (err) {
    const { error } = await admin.deleteUser(authUserId);
    if (error) logger.error({ err: error, authUserId }, 'failed to roll back auth user after profile error');
    throw err;
  }
});

usersRouter.put('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(userUpdateSchema, req.body);
  const user = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        const before = await tx.userProfile.findUnique({ where: { id } });
        if (!before) throw notFound('The user');
        const data = { username: input.username, fullName: input.fullName, phone: input.phone ?? null };
        const row = await tx.userProfile.update({ where: { id }, data, include: userInclude });
        await recordAudit(tx, actorFrom(req), {
          action: 'user.updated',
          entityType: 'user',
          entityId: id,
          summary: `User ${row.fullName} updated`,
          changes: diff(before, data, ['username', 'fullName', 'phone']),
        });
        return row;
      }),
    DUPLICATE,
  );
  ok(res, toDto(user));
});

usersRouter.put('/:id/access', async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const input = parse(userAccessSchema, req.body);
  if (id === ctx.profileId) {
    throw new AppError(
      'FORBIDDEN',
      'You cannot change your own roles or branches. Ask another administrator to make this change.',
    );
  }
  const user = await prisma.$transaction(async (tx) => {
    await lockAdminGuard(tx);
    const before = await tx.userProfile.findUnique({ where: { id }, include: userInclude });
    if (!before) throw notFound('The user');
    await assertRolesAndBranches(tx, input.roleIds, input.branchIds);
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userRole.createMany({ data: [...new Set(input.roleIds)].map((roleId) => ({ userId: id, roleId })) });
    await tx.userBranchAssignment.deleteMany({ where: { userId: id } });
    if (input.branchIds.length) {
      await tx.userBranchAssignment.createMany({
        data: [...new Set(input.branchIds)].map((branchId) => ({ userId: id, branchId })),
      });
    }
    await assertAdminRemains(tx);
    const row = await tx.userProfile.findUniqueOrThrow({ where: { id }, include: userInclude });
    await recordAudit(tx, actorFrom(req), {
      action: 'user.access_changed',
      entityType: 'user',
      entityId: id,
      summary: `Access changed for ${row.fullName}`,
      changes: {
        roles: { from: before.roles.map((r) => r.role.key), to: row.roles.map((r) => r.role.key) },
        branches: {
          from: before.branches.map((b) => b.branch.code),
          to: row.branches.map((b) => b.branch.code),
        },
      },
    });
    return row;
  });
  ok(res, toDto(user));
});

/**
 * Deactivation is enforced twice: the API rejects the profile on the very next
 * request, and the Supabase account is banned so the session cannot be refreshed.
 */
usersRouter.patch('/:id/status', async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  const { isActive } = parse(userStatusSchema, req.body);
  if (id === ctx.profileId && !isActive) {
    throw new AppError('FORBIDDEN', 'You cannot deactivate your own account.');
  }
  const target = await prisma.userProfile.findUnique({ where: { id } });
  if (!target) throw notFound('The user');
  if (target.isActive === isActive) {
    ok(res, toDto(await prisma.userProfile.findUniqueOrThrow({ where: { id }, include: userInclude })));
    return;
  }
  const admin = supabaseAdmin().auth.admin;

  if (isActive) {
    const { error } = await admin.updateUserById(target.authUserId, { ban_duration: 'none' });
    if (error) {
      logger.error({ err: error }, 'failed to lift supabase ban');
      throw new AppError('SERVICE_UNAVAILABLE', 'We could not re-enable sign-in for this account. Try again shortly.');
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    await lockAdminGuard(tx);
    const row = await tx.userProfile.update({
      where: { id },
      data: { isActive, deactivatedAt: isActive ? null : new Date() },
      include: userInclude,
    });
    if (!isActive) await assertAdminRemains(tx);
    await recordAudit(tx, actorFrom(req), {
      action: isActive ? 'user.activated' : 'user.deactivated',
      entityType: 'user',
      entityId: id,
      summary: `User ${row.fullName} ${isActive ? 'activated' : 'deactivated'}`,
    });
    return row;
  });

  if (!isActive) {
    const { error } = await admin.updateUserById(target.authUserId, { ban_duration: DEACTIVATED_BAN });
    // The API already rejects the profile, so access is revoked even if this fails.
    if (error) logger.error({ err: error, userId: id }, 'failed to ban deactivated supabase user');
  }
  ok(res, toDto(user));
});

/** Replaces a user's password with a new temporary one; the user changes it from Account settings. */
usersRouter.post('/:id/temporary-password', credentialLimiter, async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { temporaryPassword } = parse(userTemporaryPasswordSchema, req.body);
  parse(passwordPolicy, temporaryPassword);
  const user = await prisma.userProfile.findUnique({ where: { id } });
  if (!user) throw notFound('The user');
  if (!user.isActive) throw invalidState('Activate this account before setting a new password.');
  const { error } = await supabaseAdmin().auth.admin.updateUserById(user.authUserId, {
    password: temporaryPassword,
  });
  if (error) {
    logger.error({ err: error }, 'temporary password update failed');
    throw new AppError('SERVICE_UNAVAILABLE', 'We could not set the new password. Try again shortly.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetRequest.updateMany({
      where: { userId: id, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: req.auth?.profileId ?? null },
    });
    await recordAudit(tx, actorFrom(req), {
      action: 'user.temporary_password_set',
      entityType: 'user',
      entityId: id,
      summary: `Temporary password set for ${user.email}`,
    });
  });
  ok(res, { updated: true });
});
