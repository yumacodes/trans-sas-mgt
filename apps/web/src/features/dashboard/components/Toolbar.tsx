import { Link } from 'react-router';
import { ChevronDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { RANGES, type RangeKey } from '../data/dashboardMockData';

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div role="radiogroup" aria-label="Reporting period" className="inline-flex rounded-full bg-surface-muted p-1">
      {RANGES.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(r.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-dark text-white shadow-card' : 'text-ink-muted hover:text-ink',
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export function CreateMenu() {
  const { can } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="dark" size="md" className="pl-4 pr-3.5">
          <Plus aria-hidden /> Create <ChevronDown className="!size-3.5 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Create new</DropdownMenuLabel>
        <DropdownMenuItem asChild disabled={!can('clients.create')}>
          <Link to="/clients">New client</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!can('stock_items.create')}>
          <Link to="/stock-items">Add stock item</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {['New proforma', 'Record sale', 'Record payment'].map((label) => (
          <DropdownMenuItem key={label} disabled>
            {label}
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
              Planned
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
