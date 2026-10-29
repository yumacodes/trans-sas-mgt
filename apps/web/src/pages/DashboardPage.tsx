import { lazy } from 'react';

const DemoDashboard = lazy(() => import('@/features/dashboard/DemoDashboard'));
const LiveDashboard = lazy(() => import('@/features/dashboard/LiveDashboard'));

/**
 * The sample-data dashboard is shown unless VITE_DASHBOARD_DEMO=false, in which case the
 * dashboard built from real records is shown. Sample figures are never used as a fallback
 * for live data.
 */
const DEMO = import.meta.env.VITE_DASHBOARD_DEMO !== 'false';

export default function DashboardPage() {
  return DEMO ? <DemoDashboard /> : <LiveDashboard />;
}
