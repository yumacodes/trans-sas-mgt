import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from './dialogs';

/**
 * Warns before leaving a page with unsaved form changes: in-app navigation shows a
 * confirmation; closing or reloading the tab triggers the browser's prompt.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title="Leave without saving?"
      description="You have unsaved changes on this page. If you leave now, they will be lost."
      confirmLabel="Leave page"
      destructive
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  );
}
