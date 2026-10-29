import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { INVENTORY, categoryHealth, inventoryTotals } from '../data/dashboardMockData';

export function InventoryHealth({ canViewStock }: { canViewStock: boolean }) {
  const totals = inventoryTotals();
  return (
    <Card className="flex flex-col p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Inventory health</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Stock levels across your equipment catalog</p>

      <ul className="mt-5 flex-1 space-y-4">
        {INVENTORY.map((c) => {
          const { inStockPct, attention } = categoryHealth(c);
          return (
            <li key={c.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-ink">{c.label}</span>
                <span className="text-xs tabular text-ink-subtle">
                  {c.tracked} items
                  {attention && (
                    <span className="ml-1.5 rounded-full bg-highlight px-1.5 py-px font-semibold text-highlight-ink">
                      {c.belowReorder} low
                    </span>
                  )}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 rounded-full bg-surface-muted"
                role="meter"
                aria-label={`${c.label}: ${Math.round(inStockPct)}% of items above reorder level`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(inStockPct)}
              >
                <div
                  className={cn('h-full rounded-full', attention ? 'bg-highlight' : 'bg-dark')}
                  style={{ width: `${inStockPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-xs text-ink-subtle">
        {totals.below} of {totals.tracked} tracked items are at or below their reorder level.
      </p>
      {canViewStock ? (
        <Button asChild variant="dark" className="mt-3 w-full">
          <Link to="/stock">View inventory</Link>
        </Button>
      ) : (
        <Button variant="dark" className="mt-3 w-full" disabled title="You don’t have access to stock">
          View inventory
        </Button>
      )}
    </Card>
  );
}
