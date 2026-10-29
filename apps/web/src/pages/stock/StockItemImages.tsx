import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  STOCK_IMAGE_MAX_BYTES,
  STOCK_IMAGE_MAX_PER_ITEM,
  STOCK_IMAGE_MIME_TYPES,
  type StockItemImageDto,
} from '@tsm/shared';
import { ConfirmDialog } from '@/components/app/dialogs';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import { useOperation } from '@/components/app/OperationFeedback';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

/**
 * Product photographs for a stock item.
 *
 * Images live in a private bucket, so every URL here is a short-lived signed link
 * issued by the API. An item being created does not exist yet, so its images are
 * staged in the browser (StagedImagePicker) and uploaded by the form as soon as the
 * item has been saved; for an existing item each change is saved immediately.
 */

const MAX_MB = STOCK_IMAGE_MAX_BYTES / 1024 / 1024;

export const IMAGE_HINT = `PNG, JPEG or WebP, up to ${MAX_MB} MB each. Up to ${STOCK_IMAGE_MAX_PER_ITEM} images; the first one is used as the thumbnail.`;

/** Client-side check; the server validates the actual file contents again. */
function rejectReason(file: File): string | null {
  if (!(STOCK_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" is not a PNG, JPEG or WebP image.`;
  }
  if (file.size > STOCK_IMAGE_MAX_BYTES) return `"${file.name}" is larger than ${MAX_MB} MB.`;
  return null;
}

export function imagesFormData(files: File[]) {
  const fd = new FormData();
  for (const file of files) fd.append('files', file);
  return fd;
}

export async function uploadStagedImages(itemId: string, files: File[]) {
  if (files.length === 0) return;
  await api.upload<StockItemImageDto[]>(`/stock-items/${itemId}/images`, imagesFormData(files));
}

interface TileProps {
  src: string;
  label: string;
  isPrimary: boolean;
  onMakePrimary?: () => void;
  onRemove: () => void;
  removeLabel: string;
  busy?: boolean;
}

function ImageTile({
  src,
  label,
  isPrimary,
  onMakePrimary,
  onRemove,
  removeLabel,
  busy,
}: TileProps) {
  return (
    <figure className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-muted">
      <img src={src} alt={label} className="size-full object-cover" loading="lazy" />
      {isPrimary && (
        <figcaption className="absolute left-1.5 top-1.5 rounded bg-ink/75 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-white">
          Main
        </figcaption>
      )}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/70 to-transparent p-1.5',
          'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        {onMakePrimary && !isPrimary && (
          <button
            type="button"
            disabled={busy}
            onClick={onMakePrimary}
            className="rounded bg-surface/90 p-1.5 text-ink-muted hover:text-accent disabled:opacity-50"
            aria-label={`Use ${label} as the main image`}
            title="Use as main image"
          >
            <Star className="size-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="rounded bg-surface/90 p-1.5 text-ink-muted hover:text-danger disabled:opacity-50"
          aria-label={removeLabel}
          title="Remove"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </figure>
  );
}

function PickButton({
  onFiles,
  disabled,
  label,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={STOCK_IMAGE_MIME_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden /> {label}
      </Button>
    </>
  );
}

/* ---------- New item: stage files until the item exists ---------- */

export function StagedImagePicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const add = (incoming: File[]) => {
    const problem = incoming.map(rejectReason).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    if (files.length + incoming.length > STOCK_IMAGE_MAX_PER_ITEM) {
      setError(`You can attach at most ${STOCK_IMAGE_MAX_PER_ITEM} images.`);
      return;
    }
    setError(null);
    onChange([...files, ...incoming]);
  };

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              <ImageTile
                src={previews[index]!}
                label={file.name}
                isPrimary={index === 0}
                onMakePrimary={() => onChange([file, ...files.filter((_, i) => i !== index)])}
                onRemove={() => onChange(files.filter((_, i) => i !== index))}
                removeLabel={`Remove ${file.name}`}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PickButton
          onFiles={add}
          disabled={files.length >= STOCK_IMAGE_MAX_PER_ITEM}
          label={files.length > 0 ? 'Add more images' : 'Choose images'}
        />
        <p className="text-xs text-ink-subtle">
          {files.length > 0
            ? `${files.length} image(s) will be uploaded when the item is created.`
            : IMAGE_HINT}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Existing item: each change is saved immediately ---------- */

export function StockItemImageManager({
  itemId,
  canEdit,
  itemName,
}: {
  itemId: string;
  canEdit: boolean;
  itemName: string;
}) {
  const queryClient = useQueryClient();
  const { run, busy } = useOperation();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StockItemImageDto | null>(null);

  const query = useQuery({
    queryKey: qk.stockItemImages(itemId),
    queryFn: ({ signal }) =>
      api.get<StockItemImageDto[]>(`/stock-items/${itemId}/images`, undefined, signal),
  });
  const images = query.data ?? [];

  const applySaved = (saved: StockItemImageDto[]) => {
    queryClient.setQueryData(qk.stockItemImages(itemId), saved);
    void queryClient.invalidateQueries({ queryKey: qk.stockItems });
  };

  const upload = async (files: File[]) => {
    const problem = files.map(rejectReason).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    if (images.length + files.length > STOCK_IMAGE_MAX_PER_ITEM) {
      setError(`This item can hold ${STOCK_IMAGE_MAX_PER_ITEM} images in total. Remove one first.`);
      return;
    }
    setError(null);
    try {
      applySaved(
        await run(
          () =>
            api.upload<StockItemImageDto[]>(`/stock-items/${itemId}/images`, imagesFormData(files)),
          {
            pending: files.length > 1 ? 'Uploading images…' : 'Uploading image…',
            success: 'Images saved',
          },
        ),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (image: StockItemImageDto) => {
    try {
      applySaved(
        await run(
          () => api.delete<StockItemImageDto[]>(`/stock-items/${itemId}/images/${image.id}`),
          { pending: 'Removing image…', success: 'Image removed' },
        ),
      );
    } catch {
      toast.error("The image wasn't removed.");
    }
  };

  const makePrimary = async (image: StockItemImageDto) => {
    try {
      applySaved(
        await run(
          () => api.patch<StockItemImageDto[]>(`/stock-items/${itemId}/images/${image.id}/primary`),
          { pending: 'Updating main image…', success: 'Main image updated' },
        ),
      );
    } catch {
      toast.error("The main image wasn't changed.");
    }
  };

  if (query.isLoading) return <SectionLoader />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        <EmptyState
          title="No images yet"
          description={
            canEdit
              ? IMAGE_HINT
              : 'Photographs of this item will appear here once someone with permission adds them.'
          }
          icon={<ImagePlus className="size-5" aria-hidden />}
        />
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((image, index) => (
            <li key={image.id}>
              {image.url ? (
                <ImageTile
                  src={image.url}
                  label={`${itemName} image ${index + 1}`}
                  isPrimary={image.isPrimary}
                  busy={busy}
                  onMakePrimary={canEdit ? () => void makePrimary(image) : undefined}
                  onRemove={canEdit ? () => setRemoving(image) : () => undefined}
                  removeLabel={`Remove image ${index + 1}`}
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border-strong p-2 text-center text-[0.7rem] text-ink-subtle">
                  This image could not be loaded
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <PickButton
            onFiles={(files) => void upload(files)}
            disabled={images.length >= STOCK_IMAGE_MAX_PER_ITEM || busy}
            label={images.length > 0 ? 'Add more images' : 'Add images'}
          />
          {images.length > 0 && <p className="text-xs text-ink-subtle">{IMAGE_HINT}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this image?"
        description={
          <p>
            The image will be deleted from <strong>{itemName}</strong> and from storage. Documents
            generated later will not show it.
          </p>
        }
        confirmLabel="Remove image"
        destructive
        onConfirm={() => removing && remove(removing)}
      />
    </div>
  );
}
