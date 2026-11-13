import { lazy } from 'react';

const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));

/** The charted business overview, from real records. */
export default function DashboardPage() {
  return <Dashboard />;
}
