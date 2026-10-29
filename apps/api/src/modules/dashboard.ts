import { Router } from 'express';
import type { DashboardSummaryDto } from '@tsm/shared';
import { can, getAuth, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { auditInclude, toAuditDto } from '../services/audit';
import { optionalBranchWhere } from '../services/branch-scope';
import { lowStockItemIds } from '../services/inventory';

export const dashboardRouter = Router();

/**
 * Each figure is a live count with a documented definition (see DashboardSummaryDto).
 * Figures the caller may not see are returned as null, never as zero.
 */
dashboardRouter.get('/summary', requirePermission('dashboard.view'), async (req, res) => {
  const ctx = getAuth(req);
  const clientScope = optionalBranchWhere(ctx);

  const [activeClients, registeredClients, activeStockItems, lowStock, activeBranches, recent] =
    await Promise.all([
      can(ctx, 'clients.read') ? prisma.client.count({ where: { status: 'active', ...clientScope } }) : null,
      can(ctx, 'registrations.read')
        ? prisma.client.count({ where: { ...clientScope, registrations: { some: { status: 'active' } } } })
        : null,
      can(ctx, 'stock_items.read') ? prisma.stockItem.count({ where: { isActive: true } }) : null,
      can(ctx, 'inventory.read') ? lowStockItemIds(prisma, ctx) : null,
      can(ctx, 'branches.read') ? prisma.branch.count({ where: { isActive: true } }) : null,
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
    recentActivity: recent ? recent.map(toAuditDto) : null,
  };
  ok(res, summary);
});
