import type { AuditEntryDto } from './user';

/**
 * Dashboard figures. Every value is computed from database records at request time;
 * fields the requester is not permitted to see are null rather than zero.
 */
export interface DashboardSummaryDto {
  /** Clients with status "active". */
  activeClients: number | null;
  /** Distinct clients holding a registration whose status is "active". */
  registeredClients: number | null;
  /** Stock items flagged active in the catalogue. */
  activeStockItems: number | null;
  /** Active items whose on-hand quantity (visible branches) is at or below the reorder level. */
  lowStockItems: number | null;
  /** Active branches. */
  activeBranches: number | null;
  /** Latest audit events; only returned to holders of audit.read. */
  recentActivity: AuditEntryDto[] | null;
}
