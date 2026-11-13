import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Instant UI: write the expected result into the query cache before the server answers.
 * Every helper returns an undo, which restores the previous data and refetches the truth.
 * After a successful save the caller's usual invalidation replaces the guess.
 */

export type Undo = () => void;

const PENDING_PREFIX = 'pending-';

/** Id for a record that exists only in the browser until the server has saved it. */
export const pendingId = () => `${PENDING_PREFIX}${crypto.randomUUID()}`;
export const isPendingId = (id: string) => id.startsWith(PENDING_PREFIX);

interface Page {
  data: { id: string }[];
  meta?: { total: number; pageSize: number };
}

const isPage = (v: unknown): v is Page =>
  typeof v === 'object' && v !== null && Array.isArray((v as Page).data);

/**
 * Applies `mutate` to every cached query under `key`. `mutate` must be safe to run twice:
 * a fetch already in flight is cancelled, and cancelling restores that query's old data,
 * so the change is written again once the cancel has finished.
 */
export function optimisticUpdate(
  client: QueryClient,
  key: QueryKey,
  mutate: (queryKey: QueryKey, data: unknown) => unknown,
): Undo {
  const before = client.getQueriesData({ queryKey: key });
  const apply = () => {
    for (const [queryKey] of client.getQueriesData({ queryKey: key })) {
      client.setQueryData(queryKey, (old: unknown) => (old === undefined ? old : mutate(queryKey, old)));
    }
  };
  const fetching = client.isFetching({ queryKey: key }) > 0;
  apply();
  if (fetching) void client.cancelQueries({ queryKey: key }).then(apply);
  return () => {
    for (const [queryKey, data] of before) client.setQueryData(queryKey, data);
    void client.invalidateQueries({ queryKey: key });
  };
}

/** Changes one record wherever it is cached: its detail view and any list page showing it. */
export function patchRecord<T extends { id: string }>(
  client: QueryClient,
  key: QueryKey,
  id: string,
  patch: Partial<T>,
): Undo {
  return optimisticUpdate(client, key, (_queryKey, old) => {
    if (isPage(old)) {
      if (!old.data.some((row) => row.id === id)) return old;
      return { ...old, data: old.data.map((row) => (row.id === id ? { ...row, ...patch } : row)) };
    }
    if (typeof old === 'object' && old !== null && (old as { id?: unknown }).id === id) {
      return { ...old, ...patch };
    }
    return old;
  });
}

const LIST_PARAMS = new Set(['page', 'pageSize', 'sort']);

/**
 * Shows a new record at the top of the first page of unfiltered lists under `key`. Filtered
 * or later pages are left alone, because the record may not belong there. `match` names
 * list parameters that are part of the list's identity, such as an expense `kind`.
 */
export function insertRecord<T extends { id: string }>(
  client: QueryClient,
  key: QueryKey,
  row: T,
  match: Record<string, unknown> = {},
): Undo {
  return optimisticUpdate(client, key, (queryKey, old) => {
    const type = queryKey[key.length];
    const params = (queryKey[key.length + 1] ?? {}) as Record<string, unknown>;
    if (type !== 'list' || !isPage(old) || Number(params.page ?? 1) !== 1) return old;
    for (const [name, value] of Object.entries(params)) {
      if (LIST_PARAMS.has(name) || value === undefined || value === '') continue;
      if (match[name] !== value) return old;
    }
    if (old.data.some((r) => r.id === row.id)) return old;
    const limit = old.meta?.pageSize ?? old.data.length + 1;
    return {
      ...old,
      data: [row, ...old.data].slice(0, limit),
      meta: old.meta ? { ...old.meta, total: old.meta.total + 1 } : old.meta,
    };
  });
}

/** Takes a record out of every cached list under `key`, so a deleted row disappears at once. */
export function removeRecord(client: QueryClient, key: QueryKey, id: string): Undo {
  return optimisticUpdate(client, key, (_queryKey, old) => {
    if (!isPage(old) || !old.data.some((r) => r.id === id)) return old;
    return {
      ...old,
      data: old.data.filter((r) => r.id !== id),
      meta: old.meta ? { ...old.meta, total: Math.max(0, old.meta.total - 1) } : old.meta,
    };
  });
}
