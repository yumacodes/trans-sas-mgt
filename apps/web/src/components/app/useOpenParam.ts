import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

const PUSHED = 'tsm.openPushed';

/**
 * The record a page has open lives in the URL as `?open=<id>`, so:
 *  - links from elsewhere (search, notifications, reports, conversions) land on it,
 *  - a refresh keeps it open and the address can be shared with a colleague,
 *  - the browser's Back button closes it instead of leaving the page.
 * Opening adds a history entry; closing goes back over it when we added it.
 */
export function useOpenParam() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const openId = params.get('open');
  const pushedByUs = Boolean((location.state as Record<string, unknown> | null)?.[PUSHED]);

  const close = useCallback(() => {
    if (!params.has('open')) return;
    if (pushedByUs) {
      void navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  }, [params, pushedByUs, navigate, setParams]);

  const setOpenId = useCallback(
    (id: string | null) => {
      if (!id) return close();
      if (id === openId) return;
      const next = new URLSearchParams(params);
      next.set('open', id);
      // Switching from one record to another replaces the entry, so Back still closes.
      setParams(next, { replace: Boolean(openId), state: { [PUSHED]: true } });
    },
    [close, openId, params, setParams],
  );

  return [openId, setOpenId, close] as const;
}
