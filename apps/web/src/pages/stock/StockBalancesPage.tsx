import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockBalanceDto, StockItemDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { LowStockBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { useBranchOptions, useListQuery, useStockCategories } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { StockItemDetailModal } from './StockItemDetailModal';
import { StockItemFormDialog } from './StockItemFormDialog';

export default function StockBalancesPage() {
  const { can } = useAuth();
  const state = useTableState(['branchId', 'categoryId', 'lowStock']);
  const result = useListQuery<StockBalanceDto>(qk.stockBalances, '/stock-balances', state.query);
  const branches = useBranchOptions();
  const categories = useStockCategories();
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<StockItemDto | null>(null);

  const columns: ColumnDef<StockBalanceDto>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: ({ row }) =>
        can('stock_items.read') ? (
          <CellLink onClick={() => setViewItemId(row.original.item.id)} sub={row.original.item.sku}>
            {row.original.item.name}
          </CellLink>
        ) : (
          <div>
            <div className="font-medium">{row.original.item.name}</div>
            <div className="text-xs text-ink-subtle">{row.original.item.sku}</div>
          </div>
        ),
    },
    {
      id: 'branch',
      header: 'Branch',
      cell: ({ row }) => `${row.original.branch.code} — ${row.original.branch.name}`,
    },
    {
      id: 'onHand',
      header: 'On hand',
      meta: { align: 'right' },
      cell: ({ row }) => formatQuantity(row.original.quantityOnHand),
    },
    {
      id: 'reserved',
      header: 'Reserved',
      meta: { align: 'right' },
      cell: ({ row }) => formatQuantity(row.original.quantityReserved),
    },
    {
      id: 'available',
      header: 'Available',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="font-medium">
          {formatQuantity(row.original.quantityAvailable)}{' '}
          <span className="text-xs font-normal text-ink-subtle">{row.original.item.unit}</span>
        </span>
      ),
    },
    {
      id: 'reorder',
      header: 'Reorder level',
      meta: { align: 'right' },
      cell: ({ row }) => formatQuantity(row.original.item.reorderLevel),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isLowStock ? <LowStockBadge /> : <span className="text-ink-subtle">OK</span>,
    },
    {
      id: 'updatedAt',
      header: 'Last movement',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-muted">
          {formatDateTime(row.original.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock"
        description="On-hand quantities by item and branch, calculated from the stock movement ledger."
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(b) => b.id}
        onRowClick={can('stock_items.read') ? (b) => setViewItemId(b.item.id) : undefined}
        caption="Stock balances"
        searchPlaceholder="Search item code or name"
        filters={
          <>
            {(branches.data?.length ?? 0) > 1 && (
              <FilterSelect
                label="Branch"
                value={state.filters.branchId}
                onChange={(v) => state.setFilter('branchId', v)}
                options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
            <FilterSelect
              label="Category"
              value={state.filters.categoryId}
              onChange={(v) => state.setFilter('categoryId', v)}
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              label="Stock level"
              value={state.filters.lowStock}
              onChange={(v) => state.setFilter('lowStock', v)}
              options={[{ value: 'true', label: 'Low stock only' }]}
              allLabel="Any"
            />
          </>
        }
        emptyTitle="No stock on record"
        emptyDescription="Balances appear once goods are received into a branch. Purchasing and stock adjustments are added in the next phase."
      />
      <StockItemDetailModal
        itemId={viewItemId}
        onOpenChange={(o) => !o && setViewItemId(null)}
        onEdit={(i) => {
          setViewItemId(null);
          setEditItem(i);
        }}
      />
      <StockItemFormDialog
        open={Boolean(editItem)}
        item={editItem}
        onOpenChange={(o) => !o && setEditItem(null)}
      />
    </>
  );
}
