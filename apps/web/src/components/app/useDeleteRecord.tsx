import { useState, type ReactNode } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/app/dialogs';
import type { RowAction } from '@/components/app/DataTable';
import { useOperation } from '@/components/app/OperationFeedback';
import { api } from '@/lib/api';
import { removeRecord } from '@/lib/optimistic';

interface Options<T extends { id: string }> {
  /** API collection path, e.g. `/proformas`. */
  path: string;
  queryKey: QueryKey;
  /** Singular name for messages, e.g. "proforma". */
  noun: string;
  /** What the confirmation calls the record, e.g. its number. */
  label: (row: T) => string;
  /** Whether the signed-in user may delete this row; the server checks again. */
  allowed: (row: T) => boolean;
  /** Extra caches that list this record, refreshed after the delete. */
  alsoRefresh?: QueryKey[];
}

/**
 * The "Delete" entry for a table's row menu plus its confirmation. The row leaves the table
 * immediately; if the server refuses (the record is already in use) the row returns and the
 * reason is shown.
 */
export function useDeleteRecord<T extends { id: string }>(options: Options<T>): {
  action: (row: T) => RowAction;
  dialog: ReactNode;
} {
  const { path, queryKey, noun, label, allowed, alsoRefresh } = options;
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [target, setTarget] = useState<T | null>(null);

  const remove = async (row: T) => {
    try {
      await run(() => api.delete(`${path}/${row.id}`), {
        optimistic: () => removeRecord(queryClient, queryKey, row.id),
      });
      void queryClient.invalidateQueries({ queryKey });
      for (const key of alsoRefresh ?? []) void queryClient.invalidateQueries({ queryKey: key });
    } catch {
      // The error dialog already explained the failure and the row has been restored.
    }
  };

  return {
    action: (row) => ({
      label: 'Delete',
      icon: <Trash2 />,
      destructive: true,
      separatorBefore: true,
      hidden: !allowed(row),
      onSelect: () => setTarget(row),
    }),
    dialog: (
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Delete this ${noun}?`}
        description={
          <p>
            {target ? label(target) : ''} will be deleted permanently. This can't be undone. A {noun} that is already
            in use by other records can't be deleted; archive or cancel it instead.
          </p>
        }
        confirmLabel={`Delete ${noun}`}
        destructive
        onConfirm={() => target && remove(target)}
      />
    ),
  };
}
