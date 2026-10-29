import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-dark text-white hover:bg-dark-raised shadow-card',
        highlight: 'bg-highlight text-highlight-ink hover:brightness-95 shadow-card',
        dark: 'bg-dark text-white hover:bg-dark-raised shadow-card',
        secondary:
          'bg-surface text-ink border border-border-strong hover:bg-surface-muted hover:border-ink-subtle/40 shadow-card',
        outline: 'border border-border-strong text-ink hover:bg-surface-muted',
        ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        destructive: 'bg-danger text-white hover:bg-danger-hover shadow-card',
        link: 'text-accent underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-3.5 text-xs',
        md: 'h-10 px-5 text-sm',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-10 w-10',
        'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, type, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        type={type ?? 'button'}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
