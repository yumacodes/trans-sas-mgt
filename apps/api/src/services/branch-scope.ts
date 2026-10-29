import type { AuthContext } from '../middleware/auth';
import { forbidden } from '../lib/errors';

/**
 * Branch scoping policy
 * - Holders of branches.all_access see every branch.
 * - Everyone else sees records of their assigned branches. Branch-optional records
 *   (e.g. clients with no branch) are company-wide and visible to all.
 */

/** Prisma filter for a required branchId column. */
export function branchWhere(ctx: AuthContext) {
  return ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } };
}

/** Prisma filter for an optional branchId column (null = company-wide). */
export function optionalBranchWhere(ctx: AuthContext) {
  return ctx.allBranches
    ? {}
    : { OR: [{ branchId: null }, { branchId: { in: [...ctx.branchIds] } }] };
}

export function canAccessBranch(ctx: AuthContext, branchId: string | null | undefined) {
  if (!branchId) return true;
  return ctx.allBranches || ctx.branchIds.includes(branchId);
}

export function assertBranchAccess(ctx: AuthContext, branchId: string | null | undefined) {
  if (!canAccessBranch(ctx, branchId)) throw forbidden();
}
