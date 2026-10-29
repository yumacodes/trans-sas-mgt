import { useSyncExternalStore } from 'react';
import type { RangeKey } from './data/dashboardMockData';

/** Reporting period shared by the topbar's selector and the dashboard it controls. */
let current: RangeKey = 'quarter';
const listeners = new Set<() => void>();

export function useDashboardRange(): [RangeKey, (r: RangeKey) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return [
    value,
    (r) => {
      current = r;
      listeners.forEach((l) => l());
    },
  ];
}
