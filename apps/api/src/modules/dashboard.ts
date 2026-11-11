import { Router } from 'express';
import type { DashboardSummaryDto } from '@tsm/shared';
import { uuid } from '@tsm/shared';
import { z } from 'zod';
import { can, getAuth, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { auditInclude, toAuditDto } from '../services/audit';
import { assertBranchAccess, optionalBranchWhere } from '../services/branch-scope';
import { lowStockItemIds } from '../services/inventory';

export const dashboardRouter = Router();

/**
 * Each figure is a live count with a documented definition (see DashboardSummaryDto).
 * Figures the caller may not see are returned as null, never as zero.
 */
dashboardRouter.get('/summary', requirePermission('dashboard.view'), async (req, res) => {
  const ctx = getAuth(req);
  const { branchId } = parse(z.object({ branchId: uuid.optional() }), req.query);
  if (branchId) assertBranchAccess(ctx, branchId);
  // One branch's overview counts only that branch; otherwise everything the user can see.
  const scope = branchId ? { branchId } : optionalBranchWhere(ctx);
  const stockCtx = branchId ? { ...ctx, allBranches: false, branchIds: [branchId] } : ctx;
  const clientScope = scope;

  const [
    activeClients,
    registeredClients,
    activeStockItems,
    lowStock,
    activeBranches,
    openProformas,
    openTenders,
    pendingExpenses,
    recent,
  ] = await Promise.all([
      can(ctx, 'clients.read') ? prisma.client.count({ where: { status: 'active', ...clientScope } }) : null,
      can(ctx, 'registrations.read')
        ? prisma.client.count({ where: { ...clientScope, registrations: { some: { status: 'active' } } } })
        : null,
      can(ctx, 'stock_items.read') ? prisma.stockItem.count({ where: { isActive: true } }) : null,
      can(ctx, 'inventory.read') ? lowStockItemIds(prisma, stockCtx) : null,
      can(ctx, 'branches.read') ? prisma.branch.count({ where: { isActive: true } }) : null,
      can(ctx, 'proformas.read')
        ? prisma.proforma.count({ where: { ...scope, status: { in: ['draft', 'issued'] } } })
        : null,
      can(ctx, 'tenders.read')
        ? prisma.tender.count({ where: { ...scope, status: { in: ['draft', 'submitted'] } } })
        : null,
      can(ctx, 'expenses.read') ? prisma.expense.count({ where: { ...scope, status: 'pending' } }) : null,
      can(ctx, 'audit.read')
        ? prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: auditInclude })
        : null,
    ]);

  const summary: DashboardSummaryDto = {
    activeClients,
    registeredClients,
    activeStockItems,
    lowStockItems: lowStock ? lowStock.length : null,
    activeBranches,
    openProformas,
    openTenders,
    pendingExpenses,
    recentActivity: recent ? recent.map(toAuditDto) : null,
  };
  ok(res, summary);
});
