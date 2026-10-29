import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

/** Styled native select: fully keyboard/screen-reader accessible and works with `register`. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(inputClass, 'appearance-none pr-8', className)}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
      aria-hidden
    />
  </div>
));
NativeSelect.displayName = 'NativeSelect';
