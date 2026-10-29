import { Bot } from 'lucide-react';
import { BRAND } from '@/lib/brand';

/**
 * Shown while the stored session is being confirmed, in the shape of the robot check
 * everyone knows from the web. The wording stays accurate — it is the session being
 * verified, not the person — but the familiar frame makes the wait feel purposeful
 * instead of blank.
 */
export function SessionCheck({ label = 'Checking your session' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-white p-4"
    >
      <div className="w-full max-w-sm animate-rise">
        <img src={BRAND.logoSrc} alt={BRAND.fullName} className="mx-auto h-10 w-auto" />

        <div className="glass mt-7 flex items-center gap-4 rounded-2xl p-4">
          {/* Spinning ring around an empty tick box: the check is still running. */}
          <span className="relative flex size-9 shrink-0 items-center justify-center">
            <span className="absolute inset-0 rounded-md border-2 border-border" aria-hidden />
            <span
              className="absolute inset-0 animate-spin rounded-md border-2 border-transparent border-t-accent"
              aria-hidden
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{label}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Making sure it&apos;s still you — this only takes a moment.
            </p>
          </div>

          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
            aria-hidden
          >
            <Bot className="size-5" />
          </span>
        </div>

        <p className="mt-4 text-center text-xs text-ink-muted">
          No robots were asked to identify traffic lights.
        </p>
      </div>
    </div>
  );
}
