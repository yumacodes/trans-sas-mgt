import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">404</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        The address may be mistyped, or the page may have moved. Use the navigation to continue.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Go to the start page</Link>
      </Button>
    </div>
  );
}
