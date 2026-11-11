import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import {
  STOCK_IMAGE_MAX_BYTES,
  STOCK_IMAGE_MAX_PER_ITEM,
  STOCK_IMAGE_MIME_TYPES,
  type StockItemDto,
  type StockItemImageDto,
} from '@tsm/shared';
import { ConfirmDialog } from '@/components/app/dialogs';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import { useOperation } from '@/components/app/OperationFeedback';
import { EmptyState, ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { isPendingId, optimisticUpdate, patchRecord, pendingId } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

/**
 * Product photographs for a stock item.
 *
 * Images live in a private bucket, so every saved URL is a short-lived signed link issued
 * by the API. An item being created does not exist yet, so its images are staged in the
 * browser (StagedImagePicker) and uploaded by the form once the item has been saved. For an
 * existing item each change shows at once and is saved in the background.
 */

const MAX_MB = STOCK_IMAGE_MAX_BYTES / 1024 / 1024;

export const IMAGE_HINT = `PNG, JPEG or WebP, up to ${MAX_MB} MB each. Up to ${STOCK_IMAGE_MAX_PER_ITEM} images; the first one is used as the thumbnail.`;

/** Long enough for the saved image to replace the local preview on screen. */
const PREVIEW_LIFETIME_MS = 60_000;

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

/* ---------- Large photo with a thumbnail strip ---------- */

interface GalleryImage {
  key: string;
  src: string | null;
  label: string;
  isPrimary: boolean;
  /** Still being saved: shown, but it can't be changed yet. */
  saving?: boolean;
}

interface GalleryProps {
  images: GalleryImage[];
  onMakePrimary?: (key: string) => void;
  onRemove?: (key: string) => void;
}

function ImageGallery({ images, onMakePrimary, onRemove }: GalleryProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const current = images.find((i) => i.key === selectedKey) ?? images.find((i) => i.isPrimary) ?? images[0];
  if (!current) return null;

  const overlayButton =
    'inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors disabled:opacity-50';

  return (
    <div className="space-y-3">
      <figure className="relative overflow-hidden rounded-2xl border border-border bg-surface-muted">
        {current.src ? (
          <img src={current.src} alt={current.label} className="h-72 w-full object-contain sm:h-96" />
        ) : (
          <div className="flex h-72 items-center justify-center p-4 text-sm text-ink-subtle sm:h-96">
            This image could not be loaded
          </div>
        )}
        {current.isPrimary && (
          <figcaption className="absolute left-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-medium text-white">
            Main image
          </figcaption>
        )}
        {current.saving && (
          <span className="absolute bottom-3 left-3 rounded-full bg-surface/90 p-1.5" title="Saving">
            <Loader2 className="size-4 animate-spin text-ink-muted" aria-hidden />
            <span className="sr-only">Saving this image</span>
          </span>
        )}
        <div className="absolute right-3 top-3 flex gap-2">
          {onMakePrimary && !current.isPrimary && (
            <button
              type="button"
              disabled={current.saving}
              onClick={() => onMakePrimary(current.key)}
              className={cn(overlayButton, 'hover:text-accent')}
            >
              <Star className="size-3.5" aria-hidden /> Make main
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              disabled={current.saving}
              onClick={() => onRemove(current.key)}
              className={cn(overlayButton, 'hover:text-danger')}
            >
              <Trash2 className="size-3.5" aria-hidden /> Remove
            </button>
          )}
        </div>
      </figure>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image) => (
            <li key={image.key} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelectedKey(image.key)}
                aria-pressed={image.key === current.key}
                aria-label={`Show ${image.label}`}
                className={cn(
                  'block size-20 overflow-hidden rounded-xl border-2 bg-surface-muted transition-colors',
                  image.key === current.key ? 'border-accent' : 'border-transparent hover:border-border-strong',
                  image.saving && 'opacity-60',
                )}
              >
                {image.src && <img src={image.src} alt="" className="size-full object-cover" loading="lazy" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- File selection ---------- */

function usePicker(onFiles: (files: File[]) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
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
  );
  return { input, open: () => inputRef.current?.click() };
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
  const picker = usePicker(onFiles);
  return (
    <>
      {picker.input}
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={picker.open}>
        <ImagePlus aria-hidden /> {label}
      </Button>
    </>
  );
}

/** Large target shown while an item has no images. */
function PickArea({ onFiles }: { onFiles: (files: File[]) => void }) {
  const picker = usePicker(onFiles);
  return (
    <>
      {picker.input}
      <button
        type="button"
        onClick={picker.open}
        className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface-muted/50 p-4 text-center transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <ImagePlus className="size-8 text-ink-muted" aria-hidden />
        <span className="text-sm font-medium text-ink">Choose images</span>
        <span className="text-xs text-ink-subtle">{IMAGE_HINT}</span>
      </button>
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

  const keyOf = (file: File, index: number) => `${file.name}-${file.lastModified}-${index}`;
  const indexOf = (key: string) => files.findIndex((file, index) => keyOf(file, index) === key);

  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <PickArea onFiles={add} />
      ) : (
        <>
          <ImageGallery
            images={files.map((file, index) => ({
              key: keyOf(file, index),
              src: previews[index] ?? null,
              label: file.name,
              isPrimary: index === 0,
            }))}
            onMakePrimary={(key) => {
              const index = indexOf(key);
              onChange([files[index]!, ...files.filter((_, i) => i !== index)]);
            }}
            onRemove={(key) => {
              const index = indexOf(key);
              onChange(files.filter((_, i) => i !== index));
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <PickButton onFiles={add} disabled={files.length >= STOCK_IMAGE_MAX_PER_ITEM} label="Add more images" />
            <p className="text-xs text-ink-subtle">{files.length} image(s) will be saved with the item.</p>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Existing item: each change shows at once, saves in the background ---------- */

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
  const { run } = useOperation();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StockItemImageDto | null>(null);
  // Each response describes the images as of that request. With several changes in flight
  // the last answer can be out of date, so overlapping changes end with a fresh fetch.
  const inFlight = useRef(0);
  const overlapped = useRef(false);

  const key = qk.stockItemImages(itemId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api.get<StockItemImageDto[]>(`/stock-items/${itemId}/images`, undefined, signal),
  });
  const images = query.data ?? [];

  /** Updates the photos and the item's thumbnail everywhere it is shown. */
  const show = (change: (current: StockItemImageDto[]) => StockItemImageDto[]) => {
    optimisticUpdate(queryClient, key, (_k, old) => change(old as StockItemImageDto[]));
    const next = queryClient.getQueryData<StockItemImageDto[]>(key) ?? [];
    const main = next.find((i) => i.isPrimary) ?? next[0];
    patchRecord<StockItemDto>(queryClient, qk.stockItems, itemId, {
      primaryImageUrl: main?.url ?? null,
      imageCount: next.length,
    });
  };

  const begin = () => {
    if (inFlight.current > 0) overlapped.current = true;
    inFlight.current += 1;
  };

  /** `saved` is the server's list, or undefined when the change failed. */
  const finish = (saved?: StockItemImageDto[]) => {
    inFlight.current -= 1;
    if (inFlight.current > 0) return;
    if (saved && !overlapped.current) queryClient.setQueryData(key, saved);
    else void queryClient.invalidateQueries({ queryKey: key });
    overlapped.current = false;
    // Not the images themselves: refetching would swap every signed URL and reload the photos.
    void queryClient.invalidateQueries({
      queryKey: qk.stockItems,
      predicate: (q) => q.queryKey[1] !== 'images',
    });
  };

  const upload = (files: File[]) => {
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
    const staged: StockItemImageDto[] = files.map((file, index) => ({
      id: pendingId(),
      url: URL.createObjectURL(file),
      originalName: file.name,
      sizeBytes: file.size,
      position: images.length + index,
      isPrimary: images.length === 0 && index === 0,
      createdAt: new Date().toISOString(),
    }));
    const stagedIds = new Set(staged.map((i) => i.id));
    begin();
    show((current) => (current.some((i) => stagedIds.has(i.id)) ? current : [...current, ...staged]));
    run(() => api.upload<StockItemImageDto[]>(`/stock-items/${itemId}/images`, imagesFormData(files)))
      .then(finish, () => {
        show((current) => current.filter((i) => !stagedIds.has(i.id)));
        finish();
      })
      .finally(() => {
        setTimeout(() => staged.forEach((i) => URL.revokeObjectURL(i.url!)), PREVIEW_LIFETIME_MS);
      });
  };

  const remove = (image: StockItemImageDto) => {
    begin();
    show((current) => {
      const rest = current.filter((i) => i.id !== image.id);
      return image.isPrimary && rest[0] ? [{ ...rest[0], isPrimary: true }, ...rest.slice(1)] : rest;
    });
    run(() => api.delete<StockItemImageDto[]>(`/stock-items/${itemId}/images/${image.id}`)).then(finish, () =>
      finish(),
    );
  };

  const makePrimary = (image: StockItemImageDto) => {
    begin();
    show((current) => [
      { ...image, isPrimary: true },
      ...current.filter((i) => i.id !== image.id).map((i) => ({ ...i, isPrimary: false })),
    ]);
    run(() => api.patch<StockItemImageDto[]>(`/stock-items/${itemId}/images/${image.id}/primary`)).then(finish, () =>
      finish(),
    );
  };

  if (query.isLoading) return <SectionLoader />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const byId = (id: string) => images.find((i) => i.id === id);

  return (
    <div className="space-y-3">
      {images.length === 0 ? (
        canEdit ? (
          <PickArea onFiles={upload} />
        ) : (
          <EmptyState
            title="No images yet"
            description="Photographs of this item will appear here once someone with permission adds them."
            icon={<ImagePlus className="size-5" aria-hidden />}
          />
        )
      ) : (
        <>
          <ImageGallery
            images={images.map((image, index) => ({
              key: image.id,
              src: image.url,
              label: `${itemName} image ${index + 1}`,
              isPrimary: image.isPrimary,
              saving: isPendingId(image.id),
            }))}
            onMakePrimary={
              canEdit
                ? (id) => {
                    const image = byId(id);
                    if (image) makePrimary(image);
                  }
                : undefined
            }
            onRemove={canEdit ? (id) => setRemoving(byId(id) ?? null) : undefined}
          />
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <PickButton
                onFiles={upload}
                disabled={images.length >= STOCK_IMAGE_MAX_PER_ITEM}
                label="Add more images"
              />
              <p className="text-xs text-ink-subtle">{IMAGE_HINT}</p>
            </div>
          )}
        </>
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
