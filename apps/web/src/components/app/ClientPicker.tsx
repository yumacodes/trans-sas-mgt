import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import type { ClientOptionDto } from '@tsm/shared';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

interface ClientPickerProps {
  value: ClientOptionDto | null;
  onChange: (client: ClientOptionDto | null) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  disabled?: boolean;
}

/** Searchable client selector (active clients only), backed by /clients/options. */
export function ClientPicker({ value, onChange, disabled, ...aria }: ClientPickerProps) {
  const listId = useId();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const options = useQuery({
    queryKey: [...qk.clientOptions, debounced],
    queryFn: ({ signal }) => api.get<ClientOptionDto[]>('/clients/options', { q: debounced }, signal),
    enabled: open && !value,
  });
  const list = options.data ?? [];

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-xl border border-border-strong bg-surface-muted px-3 text-sm">
        <span className="truncate">
          <span className="font-medium">{value.name}</span>{' '}
          <span className="text-ink-subtle">({value.code})</span>
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-ink-subtle hover:text-ink"
            aria-label="Clear selected client"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  const select = (c: ClientOptionDto) => {
    onChange(c);
    setText('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        {...aria}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search by client name or code"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, list.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && list[highlight]) {
            e.preventDefault();
            select(list[highlight]!);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-raised"
        >
          {options.isLoading ? (
            <li className="flex items-center gap-2 px-2 py-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
            </li>
          ) : options.isError ? (
            <li className="px-2 py-2 text-sm text-danger">Couldn&apos;t load clients. Try again.</li>
          ) : list.length === 0 ? (
            <li className="px-2 py-2 text-sm text-ink-muted">No active clients match.</li>
          ) : (
            list.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(c);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                  i === highlight && 'bg-accent-soft',
                )}
              >
                <span className="font-medium">{c.name}</span>{' '}
                <span className="text-xs text-ink-subtle">{c.code}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
