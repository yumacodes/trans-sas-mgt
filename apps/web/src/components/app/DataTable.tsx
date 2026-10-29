import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { PageMeta } from '@tsm/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState } from './States';
import type { TableStateApi } from './useTableState';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Server sort field; makes the header clickable. */
    sortKey?: string;
    align?: 'left' | 'right' | 'center';
    headerClassName?: string;
    cellClassName?: string;
  }
}

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  /** Hidden actions are omitted; use for permission or state checks. */
  hidden?: boolean;
  separatorBefore?: boolean;
}

export interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  /** Receives the selected rows; call `clear` to dismiss the selection afterwards. */
  onSelect: (rows: T[], clear: () => void) => void;
}

export interface TableQueryResult<T> {
  data?: { data: T[]; meta?: PageMeta };
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  result: TableQueryResult<T>;
  state: TableStateApi;
  getRowId: (row: T) => string;
  searchPlaceholder?: string;
  /** Filter controls rendered next to the search field. */
  filters?: ReactNode;
  /** Enables row selection; the actions appear in a floating bar while rows are selected. */
  bulkActions?: BulkAction<T>[];
  /** Opens the record when its row is clicked. The row then reads as a button. */
  onRowClick?: (row: T) => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Optional label for screen readers describing the table. */
  caption?: string;
  compact?: boolean;
}

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<T>({
  columns,
  result,
  state,
  getRowId,
  searchPlaceholder,
  filters,
  bulkActions,
  onRowClick,
  emptyTitle,
  emptyDescription,
  emptyAction,
  caption,
  compact,
}: DataTableProps<T>) {
  const rows = useMemo(() => result.data?.data ?? [], [result.data]);
  const meta = result.data?.meta;

  const allColumns = columns;

  const table = useReactTable({
    data: rows,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: meta?.pageCount ?? -1,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A new page or filter shows different rows, so the old selection no longer applies.
  useEffect(() => setSelected(new Set()), [result.data]);
  const selectable = Boolean(bulkActions?.length);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(getRowId(r))), [rows, selected, getRowId]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggleRow = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(getRowId)));
  const clearSelection = () => setSelected(new Set());

  /** Opens the row, unless the click landed on its own control or finished a text selection. */
  const handleRowClick = (e: MouseEvent<HTMLTableRowElement>, row: T) => {
    const target = e.target as HTMLElement;
    if (target.closest('a,button,input,select,textarea,[role="menuitem"]')) return;
    if (window.getSelection()?.toString()) return;
    onRowClick?.(row);
  };

  const [sortField, sortDir] = (state.sort ?? '').split(':') as [string?, ('asc' | 'desc')?];

  const toggleSort = (key: string) => {
    if (sortField !== key) state.setSort(`${key}:asc`);
    else if (sortDir === 'asc') state.setSort(`${key}:desc`);
    else state.setSort(undefined);
  };

  const showSearch = searchPlaceholder !== undefined;
  const colCount = allColumns.length + (selectable ? 1 : 0);
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3.5';

  return (
    <div className="overflow-hidden rounded-3xl border border-white/80 bg-surface shadow-raised">
      {(showSearch || filters) && (
        <div className="flex flex-col gap-2 px-4 pb-1 pt-4 lg:flex-row lg:items-center">
          {showSearch && (
            <SearchInput value={state.q ?? ''} onChange={state.setSearch} placeholder={searchPlaceholder} />
          )}
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
          <div className="flex items-center gap-1 lg:ml-auto">
            {state.hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={state.clearFilters}>
                <X aria-hidden /> Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void result.refetch()}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={cn(result.isFetching && 'animate-spin')} aria-hidden />
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border/70">
                {selectable && (
                  <th scope="col" className="w-12 py-3 pl-4 pr-0">
                    <Checkbox
                      checked={allSelected ? true : selectedRows.length > 0 ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                )}
                {hg.headers.map((header) => {
                  const m = header.column.columnDef.meta;
                  const sortKey = m?.sortKey;
                  const active = sortKey && sortField === sortKey;
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        active ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined
                      }
                      className={cn(
                        cellPad,
                        'whitespace-nowrap py-3 text-left text-[11px] font-medium uppercase tracking-[0.09em] text-ink-subtle',
                        m?.align === 'right' && 'text-right',
                        m?.align === 'center' && 'text-center',
                        m?.headerClassName,
                      )}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(sortKey)}
                          className={cn(
                            'inline-flex items-center gap-1 uppercase hover:text-ink',
                            active && 'text-ink',
                          )}
                        >
                          {content}
                          {active ? (
                            sortDir === 'desc' ? (
                              <ArrowDown className="size-3" aria-hidden />
                            ) : (
                              <ArrowUp className="size-3" aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {result.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  {selectable && (
                    <td className="w-12 pl-4">
                      <Skeleton className="size-[18px] rounded-md" />
                    </td>
                  )}
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j} className={cellPad}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : result.isError ? (
              <tr>
                <td colSpan={colCount}>
                  <ErrorState message={errorMessage(result.error)} onRetry={() => void result.refetch()} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState
                    title={state.hasActiveFilters ? 'No records match your filters' : emptyTitle}
                    description={
                      state.hasActiveFilters
                        ? 'Try a different search term or clear the filters.'
                        : emptyDescription
                    }
                    action={
                      state.hasActiveFilters ? (
                        <Button variant="secondary" size="sm" onClick={state.clearFilters}>
                          Clear filters
                        </Button>
                      ) : (
                        emptyAction
                      )
                    }
                  />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => {
                const checked = selected.has(row.id);
                return (
                <tr
                  key={row.id}
                  style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                  data-selected={checked || undefined}
                  onClick={onRowClick ? (e) => handleRowClick(e, row.original) : undefined}
                  className={cn(
                    'animate-rise border-b border-border/40 transition-colors duration-200 last:border-0 hover:bg-surface-muted/60 data-[selected]:bg-surface-muted/80',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {selectable && (
                    <td className="w-12 py-0 pl-4 pr-0" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRow(row.id)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const m = cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          cellPad,
                          'align-middle text-ink',
                          m?.align === 'right' && 'text-right tabular',
                          m?.align === 'center' && 'text-center',
                          m?.cellClassName,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.total > 0 && (
        <Pagination meta={meta} onPage={state.setPage} onPageSize={state.setPageSize} />
      )}
      {selectable && selectedRows.length > 0 && (
        <BulkBar count={selectedRows.length} onDiscard={clearSelection}>
          {bulkActions?.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => a.onSelect(selectedRows, clearSelection)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-4"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </BulkBar>
      )}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), 350);
    return () => clearTimeout(t);
  }, [local, value, onChange]);

  return (
    <div className="group relative w-full lg:max-w-xs">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle transition-colors group-focus-within:text-accent"
        aria-hidden
      />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder || 'Search'}
        className="h-10 w-full rounded-full bg-surface-muted pl-10 pr-4 text-sm text-ink outline-none transition-[background-color,box-shadow] duration-200 placeholder:text-ink-subtle focus:bg-surface focus:shadow-[0_0_0_2px_var(--color-accent)]"
      />
    </div>
  );
}

/** Dark floating bar shown while rows are selected, with the page's bulk actions. */
export function BulkBar({ count, onDiscard, children }: { count: number; onDiscard: () => void; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Selected rows"
      className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-slide-up items-center gap-1 overflow-x-auto rounded-full bg-dark p-1.5 pl-5 shadow-overlay lg:left-[calc(50%+8rem)]"
    >
      <span className="mr-2 whitespace-nowrap text-sm text-white/70" aria-live="polite">
        Selected: <span className="font-semibold text-white">{count}</span>
      </span>
      {children}
      <button
        type="button"
        onClick={onDiscard}
        className="ml-1 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-dark transition-transform hover:scale-[1.03] active:scale-95"
      >
        Discard
      </button>
    </div>
  );
}

function Pagination({
  meta,
  onPage,
  onPageSize,
}: {
  meta: PageMeta;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">
        Showing <span className="font-medium text-ink">{formatCount(from)}</span>–
        <span className="font-medium text-ink">{formatCount(to)}</span> of{' '}
        <span className="font-medium text-ink">{formatCount(meta.total)}</span>
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          Rows
          <NativeSelect
            value={meta.pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-8 w-[76px] rounded-full border-transparent bg-surface-muted text-xs shadow-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </label>
        <span>
          Page {meta.page} of {Math.max(1, meta.pageCount)}
        </span>
        <div className="flex gap-1">
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => onPage(meta.page - 1)}
            disabled={meta.page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => onPage(meta.page + 1)}
            disabled={meta.page >= meta.pageCount}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Clickable primary cell that opens a record modal. */
export function CellLink({
  onClick,
  children,
  sub,
}: {
  onClick: () => void;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        className="text-left font-medium text-accent hover:text-accent-hover hover:underline"
      >
        {children}
      </button>
      {sub && <div className="truncate text-xs text-ink-subtle">{sub}</div>}
    </div>
  );
}

/** Filter select used in table toolbars. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-10 w-auto min-w-[160px] rounded-full border-transparent bg-surface-muted pl-4 shadow-none hover:bg-border/60"
    >
      <option value="">
        {label}: {allLabel}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Single-choice status filter shown as pills, in the same style as the dashboard's range selector. */
export function FilterPills({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-surface-muted p-1">
      {[{ value: '', label: 'All' }, ...options].map((o) => {
        const active = (value ?? '') === o.value;
        return (
          <button
            key={o.value || 'all'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value || undefined)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-dark text-white shadow-card' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
