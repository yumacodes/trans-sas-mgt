import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  SYSTEM_ROLES,
  type Permission,
} from '@tsm/shared';
import type { PrismaClient } from '@prisma/client';

/**
 * Bring the permissions table in line with packages/shared/src/permissions.ts and make
 * sure the system roles exist. Assignments of the Accountant, Support and custom roles
 * are never changed, so an administrator's customisations survive deployments; those
 * system roles only get their default permissions when first created. The Admin role
 * is full access by definition (the roles API refuses to restrict it).
 */
export async function syncPermissionCatalogue(db: PrismaClient) {
  const entries = Object.entries(PERMISSION_DEFINITIONS) as [
    Permission,
    { group: string; description: string },
  ][];
  await db.$transaction(async (tx) => {
    // Batched so start-up stays fast over a remote connection.
    const existing = new Map(
      (await tx.permission.findMany()).map((p) => [p.key, p] as const),
    );
    await tx.permission.createMany({
      data: entries
        .filter(([key]) => !existing.has(key))
        .map(([key, def]) => ({ key, group: def.group, description: def.description })),
    });
    for (const [key, def] of entries) {
      const current = existing.get(key);
      if (current && (current.group !== def.group || current.description !== def.description)) {
        await tx.permission.update({
          where: { key },
          data: { group: def.group, description: def.description },
        });
      }
    }
    // Remove keys that no longer exist in the catalogue (cascades to role assignments).
    await tx.permission.deleteMany({ where: { key: { notIn: entries.map(([k]) => k) } } });

    for (const key of Object.values(SYSTEM_ROLES)) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[key];
      const existing = await tx.role.findUnique({ where: { key } });
      if (existing) continue;
      await tx.role.create({
        data: {
          key,
          name: defaults.name,
          description: defaults.description,
          isSystem: true,
          permissions: { create: defaults.permissions.map((permissionKey) => ({ permissionKey })) },
        },
      });
    }
    // The admin role always holds every permission, including newly added ones.
    const adminRole = await tx.role.findUniqueOrThrow({ where: { key: SYSTEM_ROLES.admin } });
    await tx.rolePermission.createMany({
      data: entries.map(([permissionKey]) => ({ roleId: adminRole.id, permissionKey })),
      skipDuplicates: true,
    });
  }, { timeout: 30_000 });
}
