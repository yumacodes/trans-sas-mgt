import { useRef } from 'react';
import type { FieldValues, UseFormSetError } from 'react-hook-form';
import { errorMessage } from '@/lib/api';
import { applyServerErrors } from './form';
import { claimFieldError, isFieldError, reportFailure } from './OperationFeedback';

/**
 * Forms close as soon as they are submitted and save in the background. If that save
 * fails, the form reopens with what was typed, instead of being reset, so nothing has to
 * be entered again. When the server rejected particular fields, they are highlighted with
 * the server's message once the form is back on screen.
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
    /**
     * Call when a background save has failed, just before reopening the form. Pass the
     * error and the form's `setError` so field errors are shown on the fields themselves.
     */
    keepNextOpen<T extends FieldValues>(error?: unknown, setError?: UseFormSetError<T>) {
      keep.current = true;
      if (!setError || !isFieldError(error)) return;
      claimFieldError(error);
      // Wait for the reopened form to mount before marking its fields.
      setTimeout(() => {
        if (!applyServerErrors(error, setError)) reportFailure(errorMessage(error));
      }, 0);
    },
  });
  return api.current;
}
