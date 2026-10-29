import { Router } from 'express';
import {
  ALL_PERMISSIONS,
  isPermission,
  roleInputSchema,
  SYSTEM_ROLES,
  uuid,
  type Permission,
  type RoleDto,
} from '@tsm/shared';
import { requireAnyPermission, requirePermission } from '../middleware/auth';
import { invalidState, notFound, withFriendlyErrors } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { created, ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { actorFrom, recordAudit } from '../services/audit';
import { assertAdminRemains, lockAdminGuard } from '../services/admin-guard';

export const rolesRouter = Router();

const DUPLICATE = { name: 'A role with this name already exists.', key: 'A role with this name already exists.' };

const roleInclude = {
  permissions: { select: { permissionKey: true } },
  _count: { select: { users: true } },
} as const;

function toDto(role: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permissionKey: string }[];
  _count: { users: number };
}): RoleDto {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => p.permissionKey).filter(isPermission).sort(),
    userCount: role._count.users,
  };
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'role'
  );
}

rolesRouter.get('/', requireAnyPermission('roles.manage', 'users.manage'), async (_req, res) => {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  ok(res, roles.map(toDto));
});

rolesRouter.post('/', requirePermission('roles.manage'), async (req, res) => {
  const input = parse(roleInputSchema, req.body);
  const role = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        const row = await tx.role.create({
          data: {
            key: `custom_${slugify(input.name)}`,
            name: input.name,
            description: input.description ?? null,
            permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
          },
          include: roleInclude,
        });
        await recordAudit(tx, actorFrom(req), {
          action: 'role.created',
          entityType: 'role',
          entityId: row.id,
          summary: `Role "${row.name}" created`,
          changes: { permissions: input.permissions },
        });
        return row;
      }),
    DUPLICATE,
  );
  created(res, toDto(role));
});

rolesRouter.put('/:id', requirePermission('roles.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const input = parse(roleInputSchema, req.body);
  const role = await withFriendlyErrors(
    () =>
      prisma.$transaction(async (tx) => {
        await lockAdminGuard(tx);
        const before = await tx.role.findUnique({ where: { id }, include: roleInclude });
        if (!before) throw notFound('The role');
        if (before.key === SYSTEM_ROLES.admin && input.permissions.length !== ALL_PERMISSIONS.length) {
          throw invalidState(
            'The Admin role always has every permission. Create a separate role for restricted access.',
          );
        }
        const previous = new Set(before.permissions.map((p) => p.permissionKey));
        const next = new Set<Permission>(input.permissions);
        const added = [...next].filter((p) => !previous.has(p));
        const removed = [...previous].filter((p) => !next.has(p as Permission));

        await tx.rolePermission.deleteMany({ where: { roleId: id, permissionKey: { in: removed } } });
        if (added.length) {
          await tx.rolePermission.createMany({
            data: added.map((permissionKey) => ({ roleId: id, permissionKey })),
          });
        }
        await tx.role.update({
          where: { id },
          data: { name: input.name, description: input.description ?? null },
        });
        await assertAdminRemains(tx);
        await recordAudit(tx, actorFrom(req), {
          action: 'role.updated',
          entityType: 'role',
          entityId: id,
          summary: `Role "${input.name}" updated`,
          changes: {
            ...(before.name !== input.name ? { name: { from: before.name, to: input.name } } : {}),
            added,
            removed,
          },
        });
        return tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
      }),
    DUPLICATE,
  );
  ok(res, toDto(role));
});

rolesRouter.delete('/:id', requirePermission('roles.manage'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw notFound('The role');
    if (role.isSystem) throw invalidState('Built-in roles cannot be deleted. You can change their permissions instead.');
    if (role._count.users > 0) {
      throw invalidState(
        `This role is assigned to ${role._count.users} user(s). Reassign those users before deleting it.`,
      );
    }
    await tx.role.delete({ where: { id } });
    await recordAudit(tx, actorFrom(req), {
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      summary: `Role "${role.name}" deleted`,
    });
  });
  ok(res, { deleted: true });
});
