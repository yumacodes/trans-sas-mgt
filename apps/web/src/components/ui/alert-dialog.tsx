import * as React from 'react';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';

export const AlertDialog = AlertPrimitive.Root;
export const AlertDialogTrigger = AlertPrimitive.Trigger;
export const AlertDialogAction = AlertPrimitive.Action;
export const AlertDialogCancel = AlertPrimitive.Cancel;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Portal>
    <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] animate-fade-in" />
    <AlertPrimitive.Content
      ref={ref}
      className={cn(
        // Translucent, like the central operation overlay these dialogs lead into.
        'glass fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-overlay animate-scale-in focus:outline-none',
        className,
      )}
      {...props}
    />
  </AlertPrimitive.Portal>
));
AlertDialogContent.displayName = 'AlertDialogContent';

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold text-ink', className)}
    {...props}
  />
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertPrimitive.Description
    ref={ref}
    className={cn('mt-2 text-sm text-ink-muted', className)}
    {...props}
  />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';
