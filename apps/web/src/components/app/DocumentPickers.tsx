import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProformaCustomerOptionDto, ProformaItemOptionDto } from '@tsm/shared';
import { ComboInput } from '@/components/app/ComboInput';
import { api } from '@/lib/api';

export function useDebounced(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface PickerProps<T> {
  /** Module endpoint that serves the options, e.g. "/proformas" (reads `${base}/customers`). */
  base: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (option: T) => void;
  invalid?: boolean;
  placeholder?: string;
}

/** Search the client directory, or type a new name. */
export function CustomerInput({ base, value, onChange, onPick, invalid, placeholder }: PickerProps<ProformaCustomerOptionDto>) {
  const q = useDebounced(value);
  const options = useQuery({
    queryKey: [base, 'customers', q],
    queryFn: ({ signal }) => api.get<ProformaCustomerOptionDto[]>(`${base}/customers`, { q }, signal),
  });
  return (
    <ComboInput
      aria-invalid={invalid}
      value={value}
      onChange={onChange}
      options={options.data ?? []}
      loading={options.isLoading}
      getKey={(c) => c.id}
      onSelect={onPick}
      placeholder={placeholder ?? 'Search existing customers or type a new name'}
      emptyText="No existing customer matches. Keep typing to add a new one."
      renderOption={(c) => (
        <>
          <span className="font-medium">{c.name}</span> <span className="text-xs text-ink-subtle">{c.code}</span>
        </>
      )}
    />
  );
}

/** Search stock items, or type an item that isn't in the catalogue. */
export function ItemNameInput({ base, value, onChange, onPick, invalid, placeholder }: PickerProps<ProformaItemOptionDto>) {
  const q = useDebounced(value);
  const options = useQuery({
    queryKey: [base, 'items', q],
    queryFn: ({ signal }) => api.get<ProformaItemOptionDto[]>(`${base}/items`, { q }, signal),
  });
  return (
    <ComboInput
      aria-invalid={invalid}
      value={value}
      onChange={onChange}
      options={options.data ?? []}
      loading={options.isLoading}
      getKey={(i) => i.id}
      onSelect={onPick}
      placeholder={placeholder ?? 'Select or type an item'}
      emptyText="Not in stock items. Keep typing to enter it manually."
      renderOption={(i) => (
        <>
          <span className="font-medium">{i.name}</span> <span className="text-xs text-ink-subtle">{i.sku}</span>
        </>
      )}
    />
  );
}
