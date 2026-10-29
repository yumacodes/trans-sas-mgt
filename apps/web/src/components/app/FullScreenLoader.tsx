import type { CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shimmering placeholder block; the building piece of the page and section loaders. */
function Bar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('shimmer rounded-lg', className)} style={style} aria-hidden />;
}

/**
 * Placeholder in the shape of a typical page — a heading, summary cards and a table —
 * so a route that is still loading holds its layout instead of flashing a spinner.
 */
export function PageLoader({ label = 'Loading page…' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="animate-fade-in">
      <span className="sr-only">{label}</span>

      <div className="mb-6 space-y-2.5">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-56 rounded-xl" />
        <Bar className="h-3.5 w-80 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 70}ms` }}
            className="animate-rise rounded-3xl border border-white/80 bg-surface p-4 shadow-raised"
          >
            <Bar className="h-2.5 w-20" />
            <Bar className="mt-3.5 h-7 w-16 rounded-xl" />
            <Bar className="mt-3.5 h-2.5 w-24" />
          </div>
        ))}
      </div>

      <div
        style={{ animationDelay: '280ms' }}
        className="mt-5 animate-rise overflow-hidden rounded-3xl border border-white/80 bg-surface shadow-raised"
      >
        <div className="flex items-center gap-2 px-4 pb-4 pt-4">
          <Bar className="h-10 w-full max-w-xs rounded-full" />
          <Bar className="ml-auto h-10 w-28 rounded-full" />
        </div>
        <div className="border-t border-border/70 px-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{ animationDelay: `${320 + i * 60}ms` }}
              className="flex animate-rise items-center gap-4 border-b border-border/40 py-4 last:border-0"
            >
              <Bar className="size-9 shrink-0 rounded-2xl" />
              <Bar className="h-3.5 w-40 max-w-[28%]" />
              <Bar className="h-3.5 w-28 max-w-[18%]" />
              <Bar className="ml-auto h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FullScreenLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
        {label}
      </div>
    </div>
  );
}

/** Placeholder rows for a panel whose content is still loading. */
export function SectionLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="animate-fade-in space-y-3 py-2">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-4">
        <Bar className="size-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-5 w-48 max-w-[70%] rounded-xl" />
          <Bar className="h-3 w-32 max-w-[50%]" />
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 pt-1">
          <Bar className="h-3.5 w-28 shrink-0" />
          <Bar className="h-3.5 flex-1" style={{ maxWidth: `${70 - i * 9}%` }} />
        </div>
      ))}
    </div>
  );
}
