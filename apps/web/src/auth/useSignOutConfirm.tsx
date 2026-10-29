import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { ConfirmDialog } from '@/components/app/dialogs';
import { useOperation } from '@/components/app/OperationFeedback';

/**
 * Signing out is deliberate, not a stray click: it asks first, then reports the result
 * through the central operation overlay (spinner while the session is being ended,
 * checkmark once it has been). Render `signOutDialog` wherever the trigger lives.
 */
export function useSignOutConfirm() {
  const { signOut } = useAuth();
  const { run } = useOperation();
  const [open, setOpen] = useState(false);

  const requestSignOut = useCallback(() => setOpen(true), []);

  const signOutDialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Sign out?"
      description={
        <p>
          You&apos;ll be returned to the sign-in page and will need your password to come back.
          Anything you have typed but not saved will be lost.
        </p>
      }
      confirmLabel="Sign out"
      onConfirm={() =>
        void run(() => signOut(), { pending: 'Signing you out…', success: 'Logged out' })
      }
    />
  );

  return { requestSignOut, signOutDialog };
}
