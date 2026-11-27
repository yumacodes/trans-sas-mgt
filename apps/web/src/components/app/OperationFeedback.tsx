import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

export interface RunOptions<T = unknown> {
  pending?: string;
  /**
   * Confirmation shown once the server has answered. Background saves show it as a small
   * toast (never before the answer); a function can name the saved record, e.g. its number.
   */
  success?: string | ((result: T) => string);
  /** How long the success state stays visible before closing. */
  successDelayMs?: number;
  /**
   * Block the screen with the centred overlay until the server answers. Off by default:
   * operations run silently in the background so the UI never waits. Use it only where
   * the next screen depends on the answer (signing out, password reset).
   */
  blocking?: boolean;
  /**
   * Shows the expected result straight away; runs before the request. The returned undo
   * runs if the operation finally fails, so the screen never keeps an unsaved change.
   */
  optimistic?: () => (() => void) | void;
}

type Runner = <T>(fn: () => Promise<T>, opts?: RunOptions<T>) => Promise<T>;

const OperationContext = createContext<{ run: Runner; busy: boolean } | null>(null);

export const SUCCESS_DELAY_MS = 1100;

/** Field errors a form has taken over (shown on its fields), so no dialog repeats them. */
const claimedErrors = new WeakSet<object>();
export function claimFieldError(error: unknown) {
  if (error && typeof error === 'object') claimedErrors.add(error);
}

function successText<T>(success: RunOptions<T>['success'], result: T, fallback?: string) {
  if (typeof success === 'function') {
    try {
      return success(result);
    } catch {
      return fallback;
    }
  }
  return success ?? fallback;
}

export function isFieldError(error: unknown) {
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
    opts: RunOptions<unknown>;
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
      setState({ kind: 'success', message: successText(current.opts.success, result, 'Saved successfully')! });
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
      if (!opts.blocking) return runInBackground(fn, opts);
      if (pendingRef.current) {
        return Promise.reject(new Error('Another operation is still in progress.'));
      }
      return new Promise((resolve, reject) => {
        pendingRef.current = {
          fn,
          opts: opts as RunOptions<unknown>,
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
      <BackgroundSpinner />
      <SuccessToasts />
      {!open && <FailureDialog />}
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

/* ---------- Background failures ---------- */

interface Failure {
  id: number;
  title: string;
  message: string;
  retry?: () => void;
  dismiss?: () => void;
}

// Background work can fail after the component that started it has gone, so failures
// live outside React and are shown one at a time.
let failures: Failure[] = [];
let nextFailureId = 1;
const failureListeners = new Set<() => void>();

function setFailures(next: Failure[]) {
  failures = next;
  failureListeners.forEach((listener) => listener());
}

function subscribeFailures(listener: () => void) {
  failureListeners.add(listener);
  return () => void failureListeners.delete(listener);
}

function pushFailure(failure: Omit<Failure, 'id'>) {
  setFailures([...failures, { ...failure, id: nextFailureId++ }]);
}

/** Tells the user something didn't work, in the centred error dialog. */
export function reportFailure(message: string, title = "This wasn't completed") {
  pushFailure({ title, message });
}

function FailureDialog() {
  const failure = useSyncExternalStore(subscribeFailures, () => failures[0]);
  if (!failure) return null;

  const remove = () => setFailures(failures.filter((f) => f.id !== failure.id));
  const close = () => {
    remove();
    failure.dismiss?.();
  };

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/30 animate-fade-in" />
        <DialogPrimitive.Content
          className="glass fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 text-center animate-scale-in focus:outline-none"
          onEscapeKeyDown={close}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          <div role="alert">
            <FailureCross />
            <DialogPrimitive.Title className="mt-4 text-sm font-semibold text-ink">{failure.title}</DialogPrimitive.Title>
            <p className="mt-1.5 text-sm text-ink-muted">{failure.message}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={close}>
                Close
              </Button>
              {failure.retry && (
                <Button
                  size="sm"
                  onClick={() => {
                    remove();
                    failure.retry?.();
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Non-blocking run: nothing is shown while the request is in flight or when it succeeds.
 * A failure opens the error dialog with "Try again" (same closure, so the same idempotency
 * key). The returned promise settles with the server's answer; on failure it rejects, and
 * the optimistic change is undone, only once the user closes the error without retrying.
 */
const pendingListeners = new Set<() => void>();
let pendingCount = 0;
function bumpPending(delta: number) {
  pendingCount += delta;
  pendingListeners.forEach((l) => l());
}
function subscribePending(l: () => void) {
  pendingListeners.add(l);
  return () => void pendingListeners.delete(l);
}

/** Small fast spinner shown at the top while background saves are in flight. */
function BackgroundSpinner() {
  const count = useSyncExternalStore(subscribePending, () => pendingCount, () => 0);
  if (count === 0) return null;
  return (
    <div
      role="status"
      aria-label="Saving"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/20 backdrop-blur-[1px]"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-10 py-7 shadow-xl">
        <DualArc className="size-10 text-accent" style={{ '--duration': '0.5s' } as React.CSSProperties} />
        <p className="text-sm font-medium text-ink">Saving…</p>
      </div>
    </div>
  );
}

function runInBackground<T>(fn: () => Promise<T>, opts: RunOptions<T>): Promise<T> {
  const undo = opts.optimistic?.();
  return new Promise<T>((resolve, reject) => {
    const attempt = async () => {
      bumpPending(1);
      try {
        const value = await fn();
        bumpPending(-1);
        const message = successText(opts.success, value);
        if (message) pushToast(message);
        resolve(value);
      } catch (error) {
        bumpPending(-1);
        if (isFieldError(error)) {
          // The form that sent it reopens and marks the fields (see useKeepInput). If no
          // form takes the error over, explain it in the dialog as usual.
          undo?.();
          reject(error);
          setTimeout(() => {
            if (!claimedErrors.has(error as object)) pushFailure({ title: "This wasn't completed", message: errorMessage(error) });
          }, 0);
          return;
        }
        const canRetry =
          error instanceof ApiError ? error.retryable || error.code === 'INTERNAL' : true;
        pushFailure({
          title: "This wasn't completed",
          message: errorMessage(error),
          retry: canRetry ? () => void attempt() : undefined,
          dismiss: () => {
            undo?.();
            reject(error);
          },
        });
      }
    };
    void attempt();
  });
}

/* ---------- Success toasts ---------- */

interface Toast {
  id: number;
  message: string;
}
let toasts: Toast[] = [];
let nextToastId = 1;
const toastListeners = new Set<() => void>();
function setToasts(next: Toast[]) {
  toasts = next;
  toastListeners.forEach((l) => l());
}
function subscribeToasts(l: () => void) {
  toastListeners.add(l);
  return () => void toastListeners.delete(l);
}
/** A short, non-blocking confirmation in the corner. Use only after the server confirmed. */
export function pushToast(message: string) {
  const id = nextToastId++;
  setToasts([...toasts.slice(-2), { id, message }]);
  setTimeout(() => setToasts(toasts.filter((t) => t.id !== id)), 4000);
}

function SuccessToasts() {
  const list = useSyncExternalStore(subscribeToasts, () => toasts, () => toasts);
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-overlay animate-scale-in"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-success-soft" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-3.5 text-success" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {t.message}
          <button
            type="button"
            className="ml-1 rounded p-0.5 text-ink-subtle hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setToasts(toasts.filter((x) => x.id !== t.id))}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
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
