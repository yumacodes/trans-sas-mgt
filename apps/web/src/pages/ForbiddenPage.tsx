import { Link } from 'react-router';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center" role="alert">
      <div className="flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Lock className="size-5" aria-hidden />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-ink">You don&apos;t have access to this page</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        You don&apos;t have permission to view this section. Contact your administrator if you
        believe you need access.
      </p>
      <Button asChild variant="secondary" className="mt-6">
        <Link to="/">Back to the start page</Link>
      </Button>
    </div>
  );
}
