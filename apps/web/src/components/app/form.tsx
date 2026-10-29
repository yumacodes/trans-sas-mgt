import { useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { ApiError, newIdempotencyKey } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  /** A single form control; it receives id, aria-invalid and aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + hint + inline error, wired for accessibility. */
export function Field({ label, error, required, hint, className, children }: FieldProps) {
  const autoId = useId();
  const id = (children.props.id as string | undefined) ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="eyebrow !text-accent">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Shows a form-level error (for errors not tied to a field). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {message}
    </div>
  );
}

/**
 * Applies server field errors to a react-hook-form instance. Returns true when at least
 * one field error was applied, so callers know the error was handled inline.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields?: readonly string[],
): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  let applied = false;
  for (const [field, message] of Object.entries(error.fields)) {
    if (knownFields && !knownFields.includes(field.split('.')[0] ?? field)) continue;
    setError(field as Path<T>, { type: 'server', message }, { shouldFocus: !applied });
    applied = true;
  }
  return applied;
}

/**
 * Idempotency key for one logical submission. The same key is reused while the payload
 * is unchanged (so a retry after a timeout cannot create a duplicate record) and a new
 * key is issued once the payload changes or after success.
 */
export function useIdempotencyKey() {
  const state = useRef<{ key: string; payload: string } | null>(null);
  return {
    keyFor(payload: unknown) {
      const serialized = JSON.stringify(payload);
      if (!state.current || state.current.payload !== serialized) {
        state.current = { key: newIdempotencyKey(), payload: serialized };
      }
      return state.current.key;
    },
    reset() {
      state.current = null;
    },
  };
}
