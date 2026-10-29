import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(inputClass, 'h-auto min-h-[72px] py-2', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
