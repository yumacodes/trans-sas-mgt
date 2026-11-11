import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { ATTACHMENT_MAX_BYTES, type AttachmentDto, type AttachmentOwnerType } from '@tsm/shared';
import { ConfirmDialog } from '@/components/app/dialogs';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import { useOperation } from '@/components/app/OperationFeedback';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { optimisticUpdate, pendingId, isPendingId } from '@/lib/optimistic';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Supporting files on a record: award letters, supplier invoices, proof of delivery. */
export function AttachmentsPanel({ ownerType, ownerId, canManage }: { ownerType: AttachmentOwnerType; ownerId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AttachmentDto | null>(null);
  const key = ['attachments', ownerType, ownerId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.get<AttachmentDto[]>('/attachments', { ownerType, ownerId }, signal),
  });

  const add = (file: File) => {
    if (!ACCEPT.split(',').includes(file.type)) return setError('Attach a PDF, PNG, JPEG or WebP file.');
    if (file.size > ATTACHMENT_MAX_BYTES) return setError(`Files must be ${size(ATTACHMENT_MAX_BYTES)} or smaller.`);
    setError(null);
    const data = new FormData();
    data.set('ownerType', ownerType);
    data.set('ownerId', ownerId);
    data.set('file', file);
    const placeholder: AttachmentDto = {
      id: pendingId(),
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedBy: '',
      createdAt: new Date().toISOString(),
      url: null,
    };
    void run(() => api.upload<AttachmentDto>('/attachments', data), {
      optimistic: () => optimisticUpdate(queryClient, key, (_k, old) => [placeholder, ...((old as AttachmentDto[]) ?? []).filter((a) => a.id !== placeholder.id)]),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: key }))
      .catch(() => undefined);
  };

  const remove = (a: AttachmentDto) => {
    void run(() => api.delete(`/attachments/${a.id}`), {
      optimistic: () => optimisticUpdate(queryClient, key, (_k, old) => ((old as AttachmentDto[]) ?? []).filter((x) => x.id !== a.id)),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: key }))
      .catch(() => undefined);
  };

  if (query.isLoading) return <SectionLoader />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const files = query.data ?? [];

  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <EmptyState title="No files attached" description="Attach award letters, supplier invoices, proof of delivery and other supporting documents." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {files.map((a) => (
            <li key={a.id} className={`flex items-center gap-3 px-4 py-3 ${isPendingId(a.id) ? 'opacity-60' : ''}`}>
              <FileText className="size-5 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-accent hover:underline">
                    {a.name}
                  </a>
                ) : (
                  <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
                )}
                <span className="text-xs text-ink-subtle">
                  {isPendingId(a.id) ? 'Uploading…' : `${size(a.sizeBytes)} · ${a.uploadedBy} · ${formatDateTime(a.createdAt)}`}
                </span>
              </div>
              {canManage && !isPendingId(a.id) && (
                <button
                  type="button"
                  onClick={() => setRemoving(a)}
                  className="rounded-full p-2 text-ink-muted hover:bg-surface-muted hover:text-danger"
                  aria-label={`Remove ${a.name}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <label className="cursor-pointer">
              <Paperclip aria-hidden /> Attach file
              <input
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) add(f);
                }}
              />
            </label>
          </Button>
          <span className="text-xs text-ink-subtle">PDF or image, up to {size(ATTACHMENT_MAX_BYTES)}.</span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this file?"
        description={<p>{removing?.name} will be removed from this record.</p>}
        confirmLabel="Remove file"
        destructive
        onConfirm={() => removing && remove(removing)}
      />
    </div>
  );
}
