import { useRef } from 'react';

/**
 * Forms close as soon as they are submitted and save in the background. If that save
 * fails, the form reopens with what was typed, instead of being reset, so nothing has to
 * be entered again.
 */
export function useKeepInput() {
  const keep = useRef(false);
  const api = useRef({
    /** Call when the form opens: false means "reset to fresh values". */
    restoring() {
      const value = keep.current;
      keep.current = false;
      return value;
    },
    /** Call when a background save has failed, just before reopening the form. */
    keepNextOpen() {
      keep.current = true;
    },
  });
  return api.current;
}
