import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, FileText, Loader2, Search } from 'lucide-react';
import type { SearchResultDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { filterNav, NAV, type NavItem } from './nav';

interface Entry {
  key: string;
  group: string;
  title: string;
  detail?: string | null;
  link: string;
  icon?: NavItem['icon'];
}

function flatten(items: NavItem[], parent?: string): Entry[] {
  return items.flatMap((item) => [
    ...(item.to
      ? [{ key: `page:${item.to}`, group: 'Pages', title: item.label, detail: parent ?? item.group ?? null, link: item.to, icon: item.icon }]
      : []),
    ...(item.children ? flatten(item.children, item.label) : []),
  ]);
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const SEARCH_SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

/**
 * Global search (Ctrl/⌘+K or "/"): jump to any page, or to a client, item or document by
 * name or number. Results come from /search, which applies the user's permissions and
 * branch scope, and open the record on its own page (`?open=`).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { canAny } = useAuth();
  const listRef = useRef<HTMLUListElement>(null);
  const q = useDebounced(text.trim(), 200);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('tsm:open-search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('tsm:open-search', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setText('');
      setActive(0);
    }
  }, [open]);

  const pages = useMemo(() => flatten(filterNav(NAV, canAny)), [canAny]);
  const pageMatches = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!needle) return pages.slice(0, 8);
    return pages.filter((p) => p.title.toLowerCase().includes(needle)).slice(0, 6);
  }, [pages, text]);

  const search = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api.get<SearchResultDto[]>('/search', { q }, signal),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
  });

  const records: Entry[] = (q.length >= 2 ? (search.data ?? []) : []).map((r) => ({
    key: `${r.kind}:${r.id}`,
    group: r.kind,
    title: r.title,
    detail: r.detail,
    link: r.link,
  }));
  const entries = [...records, ...pageMatches];

  useEffect(() => setActive(0), [q, text]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    void navigate(entry.link);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(entries[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  const searching = q.length >= 2 && search.isFetching;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay animate-scale-in focus:outline-none"
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            {searching ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-ink-subtle" aria-hidden />
            ) : (
              <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
            )}
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search clients, items, S-0042, PF-…, or a page"
              className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle"
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={entries[active] ? `cmd-${active}` : undefined}
              aria-label="Search"
            />
            <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] text-ink-subtle sm:block">Esc</kbd>
          </div>
          <ul id="command-results" ref={listRef} role="listbox" className="scrollbar-slim max-h-[60vh] overflow-y-auto p-2">
            {search.isError && q.length >= 2 && (
              <li className="px-3 py-2 text-sm text-danger">{errorMessage(search.error)}</li>
            )}
            {entries.length === 0 && !searching && (
              <li className="px-3 py-8 text-center text-sm text-ink-muted">
                {q.length >= 2 ? `Nothing matches “${q}”.` : 'Type at least two characters to search records.'}
              </li>
            )}
            {entries.map((entry, index) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              const Icon = entry.icon ?? FileText;
              return (
                <li key={entry.key} role="presentation">
                  {header && <p className="eyebrow px-3 pb-1 pt-3 first:pt-1">{header}</p>}
                  <div
                    id={`cmd-${index}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(entry)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                      index === active ? 'bg-accent-soft text-ink' : 'text-ink-muted',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">{entry.title}</span>
                      {entry.detail && <span className="ml-2 text-ink-subtle">{entry.detail}</span>}
                    </span>
                    {index === active && <CornerDownLeft className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Opens the palette from a button (keyboard users have the shortcut). */
export function openSearch() {
  window.dispatchEvent(new Event('tsm:open-search'));
}
