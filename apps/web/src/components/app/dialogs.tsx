import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => unknown;
}

/** Confirmation for consequential actions; names the affected record and the consequence. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>{description}</div>
        </AlertDialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => {
              onOpenChange(false);
              void onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** When true, closing asks for confirmation so unsaved input isn't silently discarded. */
  isDirty: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  isDirty,
  size = 'lg',
  children,
}: FormDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (isDirty) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent size={size}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="The information you entered in this form has not been saved. If you close it now, those changes will be lost."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => onOpenChange(false)}
      />
    </>
  );
}
