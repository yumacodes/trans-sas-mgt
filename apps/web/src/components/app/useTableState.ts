import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export interface TableState {
  page: number;
  pageSize: number;
  sort?: string;
  q?: string;
  filters: Record<string, string | undefined>;
}

export interface TableStateApi extends TableState {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSort: (sort: string | undefined) => void;
  setSearch: (q: string) => void;
  setFilter: (key: string, value: string | undefined) => void;
  clearFilters: () => void;
  /** Query object to send to the list endpoint. */
  query: Record<string, string | number | undefined>;
  hasActiveFilters: boolean;
}

/**
 * List state (page, size, sort, search, filters) kept in the URL, so it survives reloads
 * and is restored when the user navigates back from a detail view.
 */
export function useTableState(
  filterKeys: readonly string[] = [],
  defaults: { sort?: string; pageSize?: number } = {},
): TableStateApi {
  const [params, setParams] = useSearchParams();

  const update = useCallback(
    (changes: Record<string, string | undefined>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          if (resetPage && !('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Number(params.get('pageSize')) || defaults.pageSize || 25;
  const sort = params.get('sort') ?? defaults.sort;
  const q = params.get('q') ?? undefined;

  const filterSignature = filterKeys.map((k) => `${k}=${params.get(k) ?? ''}`).join('&');
  const filters = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const k of filterKeys) out[k] = params.get(k) ?? undefined;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  const query = useMemo(
    () => ({ page, pageSize, sort, q, ...filters }),
    [page, pageSize, sort, q, filters],
  );

  return {
    page,
    pageSize,
    sort,
    q,
    filters,
    query,
    hasActiveFilters: Boolean(q) || Object.values(filters).some(Boolean),
    setPage: (p) => update({ page: p <= 1 ? undefined : String(p) }, false),
    setPageSize: (s) => update({ pageSize: String(s) }),
    setSort: (s) => update({ sort: s }),
    setSearch: (value) => update({ q: value.trim() || undefined }),
    setFilter: (key, value) => update({ [key]: value }),
    clearFilters: () =>
      update(Object.fromEntries(['q', ...filterKeys].map((k) => [k, undefined]))),
  };
}

/** Same API as useTableState, kept in component state (for tables inside dialogs). */
export function useLocalTableState(
  defaults: { sort?: string; pageSize?: number } = {},
): TableStateApi {
  const [state, setState] = useState<TableState>({
    page: 1,
    pageSize: defaults.pageSize ?? 10,
    sort: defaults.sort,
    q: undefined,
    filters: {},
  });
  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      sort: state.sort,
      q: state.q,
      ...state.filters,
    }),
    [state],
  );
  return {
    ...state,
    query,
    hasActiveFilters: Boolean(state.q) || Object.values(state.filters).some(Boolean),
    setPage: (page) => setState((s) => ({ ...s, page })),
    setPageSize: (pageSize) => setState((s) => ({ ...s, pageSize, page: 1 })),
    setSort: (sort) => setState((s) => ({ ...s, sort, page: 1 })),
    setSearch: (q) => setState((s) => ({ ...s, q: q.trim() || undefined, page: 1 })),
    setFilter: (key, value) =>
      setState((s) => ({ ...s, filters: { ...s.filters, [key]: value }, page: 1 })),
    clearFilters: () => setState((s) => ({ ...s, q: undefined, filters: {}, page: 1 })),
  };
}
