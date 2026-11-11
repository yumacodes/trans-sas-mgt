import { Prisma } from '@prisma/client';
import type { Permission } from '@tsm/shared';
import type { Db } from '../lib/prisma';

/**
 * In-app notifications, created only for real events. Recipients are chosen by permission
 * and branch, so nobody hears about records they couldn't open. A `dedupeKey` makes an
 * event notify each person once, however many times it is raised.
 */

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  /** Page the notification opens. */
  link?: string;
  dedupeKey?: string;
}

/** Active users holding a permission who can see the branch (when one is given). */
export async function usersWithPermission(db: Db, permission: Permission, branchId?: string | null) {
  const holds = (key: string) => ({ roles: { some: { role: { permissions: { some: { permissionKey: key } } } } } });
  const rows = await db.userProfile.findMany({
    where: {
      isActive: true,
      ...holds(permission),
      ...(branchId ? { OR: [{ branches: { some: { branchId } } }, holds('branches.all_access')] } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function notify(db: Db, recipients: string[], input: NotificationInput) {
  const unique = [...new Set(recipients)];
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
    skipDuplicates: true,
  });
}

/** Notifies permission holders in a branch, leaving out the person who caused the event. */
export async function notifyPermission(
  db: Db,
  permission: Permission,
  branchId: string | null | undefined,
  actorId: string | null,
  input: NotificationInput,
) {
  const recipients = await usersWithPermission(db, permission, branchId);
  await notify(db, recipients.filter((id) => id !== actorId), input);
}

/** Warns a branch's stock users about these items if they are now at or below reorder level. */
export async function notifyLowStock(db: Db, branchId: string, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const rows = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT i.id, i.name
    FROM stock_balances b
    JOIN stock_items i ON i.id = b."itemId"
    WHERE b."branchId" = ${branchId}::uuid
      AND i.id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND i."isActive" = TRUE
      AND i."reorderLevel" > 0
      AND b."quantityOnHand" <= i."reorderLevel"`;
  const day = new Date().toISOString().slice(0, 10);
  for (const item of rows) {
    await notifyPermission(db, 'inventory.read', branchId, null, {
      type: 'low_stock',
      title: `${item.name} is low on stock`,
      body: 'It is at or below its reorder level.',
      link: '/stock-items?lowStock=true',
      dedupeKey: `low-stock:${item.id}:${branchId}:${day}`,
    });
  }
}
