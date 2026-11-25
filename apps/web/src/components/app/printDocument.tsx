import { useSyncExternalStore } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import type { AttachmentDto, AttachmentOwnerType } from '@tsm/shared';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api, fetchPdfBlob, printBlob } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { reportFailure } from './OperationFeedback';

/**
 * Print a record's PDF, offering to add its attached files after the last page.
 *
 * With no attachments (or if they can't be listed) the document prints straight away, as
 * before. Otherwise the user is asked once: the document alone, or the document followed by
 * every attached file in the order they were added.
 */

type Choice = 'with' | 'without' | 'cancel';

interface Pending {
  label: string;
  files: AttachmentDto[];
  resolve: (choice: Choice) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const setPending = (next: Pending | null) => {
  pending = next;
  listeners.forEach((fn) => fn());
};

function ask(label: string, files: AttachmentDto[]): Promise<Choice> {
  // A second Print click while the question is open answers the first one as cancelled.
  pending?.resolve('cancel');
  return new Promise((resolve) => setPending({ label, files, resolve }));
}

export interface PrintTarget {
  /** The record's PDF route, e.g. `/proformas/<id>/pdf`. */
  path: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  /** Names the document in the question, e.g. "PF-2026-00005". */
  label: string;
}

export async function printDocument({ path, ownerType, ownerId, label }: PrintTarget): Promise<void> {
  // Start fetching the document while the attachments are listed; both are needed anyway.
  const documentPdf = fetchPdfBlob(path);
  documentPdf.catch(() => undefined);

  let files: AttachmentDto[] = [];
  try {
    files = await api.get<AttachmentDto[]>('/attachments', { ownerType, ownerId });
  } catch {
    // If the files can't be listed, printing the document itself still works.
    files = [];
  }

  if (files.length === 0) {
    printBlob(await documentPdf);
    return;
  }

  const choice = await ask(label, files);
  if (choice === 'cancel') return;
  if (choice === 'without') {
    printBlob(await documentPdf);
    return;
  }

  // Oldest first: the order the files were attached in.
  const ordered = [...files].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const { mergeWithAttachments } = await import('@/lib/mergePdf');
  const { blob, skipped } = await mergeWithAttachments(await documentPdf, ordered);
  printBlob(blob);
  if (skipped.length > 0) {
    reportFailure(
      `The document printed, but ${skipped.map((s) => `"${s.name}" (${s.reason})`).join(', ')} could not be added. Open it from the Files tab to print it separately.`,
      skipped.length === 1 ? 'One file was left out' : `${skipped.length} files were left out`,
    );
  }
}

/** The question itself. Mounted once, near the root of the app. */
export function PrintChoiceHost() {
  const current = useSyncExternalStore(subscribe, () => pending);
  const answer = (choice: Choice) => {
    current?.resolve(choice);
    setPending(null);
  };
  const count = current?.files.length ?? 0;

  return (
    <AlertDialog open={Boolean(current)} onOpenChange={(open) => !open && answer('cancel')}>
      <AlertDialogContent>
        <AlertDialogTitle>Print the attached files too?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>
            <p>
              {current?.label} has {count} attached file{count === 1 ? '' : 's'}. They can print straight after the
              document&apos;s last page.
            </p>
            <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-surface-muted/50 p-2.5">
              {[...(current?.files ?? [])]
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm text-ink">
                    {f.mimeType === 'application/pdf' ? (
                      <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    ) : (
                      <ImageIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-ink-subtle">{formatBytes(f.sizeBytes)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </AlertDialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => answer('cancel')}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => answer('without')}>
            Document only
          </Button>
          <Button onClick={() => answer('with')} autoFocus>
            Print with files
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
