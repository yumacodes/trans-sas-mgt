import { ADMIN_GUARD_PERMISSION } from '@tsm/shared';
import { invalidState } from '../lib/errors';
import type { Tx } from '../lib/prisma';

/**
 * Serialises changes that could remove the last administrator. Every such change
 * takes this transaction-scoped advisory lock first, applies its update, then calls
 * assertAdminRemains() before commit.
 */
export async function lockAdminGuard(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-guard'))`;
}

export async function countActiveAdmins(tx: Tx) {
  return tx.userProfile.count({
    where: {
      isActive: true,
      roles: {
        some: { role: { permissions: { some: { permissionKey: ADMIN_GUARD_PERMISSION } } } },
      },
    },
  });
}

export async function assertAdminRemains(tx: Tx) {
  if ((await countActiveAdmins(tx)) < 1) {
    throw invalidState(
      'This change would leave no active administrator who can manage users. Assign another administrator first.',
    );
  }
}
