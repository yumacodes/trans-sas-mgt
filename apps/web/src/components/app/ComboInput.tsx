import { useId, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ComboInputProps<T> {
  /** The text in the box. Free text is allowed: it is the value even when nothing is picked. */
  value: string;
  onChange: (text: string) => void;
  options: T[];
  /** Called when a suggestion is picked. */
  onSelect: (option: T) => void;
  renderOption: (option: T) => ReactNode;
  getKey: (option: T) => string;
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  disabled?: boolean;
}

/** Text input with a suggestion dropdown: pick an existing record or just type a new value. */
export function ComboInput<T>({
  value,
  onChange,
  options,
  onSelect,
  renderOption,
  getKey,
  loading,
  placeholder,
  emptyText = 'No matches. Keep typing to add a new one.',
  disabled,
  ...aria
}: ComboInputProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const pick = (option: T) => {
    onSelect(option);
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
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && options[highlight]) {
            e.preventDefault();
            pick(options[highlight]!);
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
          className="absolute z-50 mt-1 max-h-60 w-full min-w-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-raised"
        >
          {loading ? (
            <li className="flex items-center gap-2 px-2 py-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
            </li>
          ) : options.length === 0 ? (
            <li className="px-2 py-2 text-sm text-ink-muted">{emptyText}</li>
          ) : (
            options.map((option, i) => (
              <li
                key={getKey(option)}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn('cursor-pointer rounded-sm px-2 py-1.5 text-sm', i === highlight && 'bg-accent-soft')}
              >
                {renderOption(option)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
