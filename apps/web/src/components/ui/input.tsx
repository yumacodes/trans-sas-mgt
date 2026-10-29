import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'flex h-10 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-1.5 text-sm text-ink placeholder:text-ink-subtle shadow-card transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 focus-visible:border-accent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-[invalid=true]:border-danger';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputClass, className)} {...props} />
  ),
);
Input.displayName = 'Input';
