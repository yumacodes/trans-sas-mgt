import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { RANGES, type RangeKey } from './data/model';

/**
 * Reporting period shared by the topbar's selector and the dashboard it controls. It lives in
 * the URL (`?range=month`) so a dashboard link and a reload keep it; the last choice is also
 * remembered in this browser for when the dashboard is opened without one.
 */
const STORAGE_KEY = 'tsm.dashboard.range';
const DEFAULT_RANGE: RangeKey = 'quarter';

const isRange = (value: string | null | undefined): value is RangeKey => RANGES.some((r) => r.key === value);

function remembered(): RangeKey | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isRange(value) ? value : null;
  } catch {
    return null;
  }
}

function remember(range: RangeKey) {
  try {
    window.localStorage.setItem(STORAGE_KEY, range);
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the URL still holds it.
  }
}

export function useDashboardRange(): [RangeKey, (r: RangeKey) => void] {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('range');
  const range = isRange(fromUrl) ? fromUrl : (remembered() ?? DEFAULT_RANGE);
  const setRange = useCallback(
    (r: RangeKey) => {
      remember(r);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('range', r);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [range, setRange];
}
