import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { SearchResultDto } from '@tsm/shared';
import { useDebounced } from '@/components/app/DocumentPickers';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Top-bar search across clients, items and document numbers. Arrow keys move through the
 * results and Enter opens one. "/" focuses the box from anywhere.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text);

  const query = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api.get<SearchResultDto[]>('/search', { q }, signal),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
  const results = query.data ?? [];

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !target.closest('input,textarea,select,[contenteditable="true"]')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (r: SearchResultDto) => {
    setOpen(false);
    setText('');
    void navigate(r.link);
  };

  const showList = open && q.length >= 2;

  return (
    <div className="relative hidden w-full max-w-xs md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls="global-search-results"
        aria-label="Search clients, items and documents"
        placeholder="Search…  ( / )"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-full border border-transparent bg-surface-muted pl-9 pr-4 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
      />
      {showList && (
        <ul
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-12 z-40 max-h-96 overflow-y-auto rounded-2xl border border-border bg-surface p-1 shadow-overlay"
        >
          {query.isLoading ? (
            <li className="px-3 py-2 text-sm text-ink-subtle">Searching…</li>
          ) : query.isError ? (
            <li className="px-3 py-2 text-sm text-danger">Search isn't available right now.</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-subtle">Nothing matches “{q}”.</li>
          ) : (
            results.map((r, i) => (
              <li
                key={`${r.kind}-${r.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(r);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('cursor-pointer rounded-xl px-3 py-2', i === active && 'bg-surface-muted')}
              >
                <span className="block text-sm font-medium text-ink">{r.title}</span>
                <span className="block text-xs text-ink-subtle">
                  {r.kind}
                  {r.detail ? ` · ${r.detail}` : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
