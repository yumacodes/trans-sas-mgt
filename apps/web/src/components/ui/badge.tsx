import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Status badge. Always carries a text label so status is never conveyed by colour alone. */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-[3px] text-[10.5px] font-semibold uppercase leading-none tracking-[0.06em] whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border-strong text-ink-muted',
        accent: 'border-accent/40 text-accent',
        success: 'border-success/45 text-success',
        warning: 'border-warning/45 text-warning',
        danger: 'border-danger/45 text-danger',
        info: 'border-info/45 text-info',
        highlight: 'border-highlight-ink/10 bg-highlight text-highlight-ink',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
