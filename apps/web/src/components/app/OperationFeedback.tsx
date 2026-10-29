import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { DualArc } from '@/components/ui/dual-arc';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Central feedback for important operations:
 *   pending  → spinner, background blocked (prevents duplicate submissions)
 *   success  → checkmark, shown ONLY after the server confirmed the operation
 *   error    → understandable message with "Try again" (same request, same idempotency key) or "Close"
 *
 * Validation errors that belong to individual fields are not shown here: the overlay
 * closes and the error is re-thrown so the form can highlight the fields.
 */

type OpState =
  | { kind: 'idle' }
  | { kind: 'pending'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; canRetry: boolean };

export interface RunOptions {
  pending?: string;
  success?: string;
  /** How long the success state stays visible before closing. */
  successDelayMs?: number;
}

type Runner = <T>(fn: () => Promise<T>, opts?: RunOptions) => Promise<T>;

const OperationContext = createContext<{ run: Runner; busy: boolean } | null>(null);

export const SUCCESS_DELAY_MS = 1100;

function isFieldError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === 'VALIDATION_FAILED' || error.code === 'DUPLICATE') &&
    Boolean(error.fields && Object.keys(error.fields).length > 0)
  );
}

export function OperationFeedbackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpState>({ kind: 'idle' });
  const pendingRef = useRef<{
    fn: () => Promise<unknown>;
    opts: RunOptions;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
    lastError?: unknown;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const attempt = useCallback(async () => {
    const current = pendingRef.current;
    if (!current) return;
    setState({ kind: 'pending', message: current.opts.pending ?? 'Saving…' });
    try {
      const result = await current.fn();
      setState({ kind: 'success', message: current.opts.success ?? 'Saved successfully' });
      timer.current = setTimeout(() => {
        setState({ kind: 'idle' });
        pendingRef.current = null;
        current.resolve(result);
      }, current.opts.successDelayMs ?? SUCCESS_DELAY_MS);
    } catch (error) {
      if (isFieldError(error)) {
        setState({ kind: 'idle' });
        pendingRef.current = null;
        current.reject(error);
        return;
      }
      current.lastError = error;
      const canRetry = error instanceof ApiError ? error.retryable || error.code === 'INTERNAL' : true;
      setState({ kind: 'error', message: errorMessage(error), canRetry });
    }
  }, []);

  const run = useCallback<Runner>(
    (fn, opts = {}) => {
      if (pendingRef.current) {
        return Promise.reject(new Error('Another operation is still in progress.'));
      }
      return new Promise((resolve, reject) => {
        pendingRef.current = {
          fn,
          opts,
          resolve: resolve as (v: unknown) => void,
          reject,
        };
        void attempt();
      });
    },
    [attempt],
  );

  const dismissError = () => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setState({ kind: 'idle' });
    current?.reject(current.lastError);
  };

  const open = state.kind !== 'idle';

  return (
    <OperationContext.Provider value={{ run, busy: open }}>
      {children}
      <DialogPrimitive.Root open={open}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/30 animate-fade-in" />
          <DialogPrimitive.Content
            className={cn(
              'glass fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 text-center animate-scale-in focus:outline-none',
              // A small square while it works and when it succeeds; wider when there is
              // an error to read and buttons to press.
              state.kind === 'error'
                ? 'w-[calc(100%-2rem)] max-w-sm'
                : 'flex size-56 flex-col items-center justify-center',
            )}
            onEscapeKeyDown={(e) => {
              if (state.kind === 'error') dismissError();
              else e.preventDefault();
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            aria-describedby={undefined}
          >
            <div aria-live="assertive" role="status">
              {state.kind === 'pending' && (
                <>
                  <DualArc className="mx-auto size-12 text-accent" style={{ '--duration': '0.9s' } as CSSProperties} />
                  <DialogPrimitive.Title className="mt-5 text-sm font-medium text-ink">
                    {state.message}
                  </DialogPrimitive.Title>
                </>
              )}
              {state.kind === 'success' && (
                <>
                  <SuccessCheck />
                  <DialogPrimitive.Title className="mt-5 text-sm font-medium text-ink">
                    {state.message}
                  </DialogPrimitive.Title>
                </>
              )}
              {state.kind === 'error' && (
                <>
                  <FailureCross />
                  <DialogPrimitive.Title className="mt-4 text-sm font-semibold text-ink">
                    This wasn&apos;t completed
                  </DialogPrimitive.Title>
                  <p className="mt-1.5 text-sm text-ink-muted">{state.message}</p>
                  <div className="mt-5 flex justify-center gap-2">
                    <Button variant="secondary" size="sm" onClick={dismissError}>
                      Close
                    </Button>
                    {state.canRetry && (
                      <Button size="sm" onClick={() => void attempt()}>
                        Try again
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </OperationContext.Provider>
  );
}

function SuccessCheck() {
  return (
    <div
      className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft animate-pop"
      data-testid="operation-success"
    >
      <svg viewBox="0 0 24 24" className="size-8 text-success" fill="none" aria-hidden>
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={24}
          strokeDashoffset={24}
          className="animate-check"
        />
      </svg>
    </div>
  );
}

/** Red cross drawn with the same stroke animation as the success tick. */
function FailureCross() {
  return (
    <div
      className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger-soft animate-scale-in"
      data-testid="operation-error"
    >
      <svg viewBox="0 0 24 24" className="size-8 text-danger" fill="none" aria-hidden>
        {['M7 7l10 10', 'M17 7L7 17'].map((d, i) => (
          <path
            key={d}
            d={d}
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeDasharray={24}
            strokeDashoffset={24}
            className="animate-check"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}

export function useOperation() {
  const ctx = useContext(OperationContext);
  if (!ctx) throw new Error('useOperation must be used within OperationFeedbackProvider');
  return ctx;
}
