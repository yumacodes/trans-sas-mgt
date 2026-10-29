import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export function ErrorState({
  title = "We couldn't load this information",
  message,
  onRetry,
  secondaryAction,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{message}</p>
      <div className="mt-4 flex gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden /> Try again
          </Button>
        )}
        {secondaryAction && (
          <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
