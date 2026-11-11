import { lazy } from 'react';

const DemoDashboard = lazy(() => import('@/features/dashboard/DemoDashboard'));
const LiveDashboard = lazy(() => import('@/features/dashboard/LiveDashboard'));

/**
 * The dashboard is built from real records. VITE_DASHBOARD_DEMO=true swaps in the sample
 * design for demonstrations; sample figures are never used as a fallback for live data.
 */
const DEMO = import.meta.env.VITE_DASHBOARD_DEMO === 'true';

export default function DashboardPage() {
  return DEMO ? <DemoDashboard /> : <LiveDashboard />;
}
