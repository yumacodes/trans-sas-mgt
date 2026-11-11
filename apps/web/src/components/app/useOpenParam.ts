import { useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The record a page has open, starting from `?open=<id>` so links from elsewhere (search,
 * notifications, conversions) land on it. Closing removes the parameter again.
 */
export function useOpenParam() {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const close = () => {
    setOpenId(null);
    if (params.has('open')) {
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
    }
  };
  return [openId, setOpenId, close] as const;
}
