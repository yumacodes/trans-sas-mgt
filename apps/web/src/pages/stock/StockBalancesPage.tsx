import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { StockBalanceDto, StockItemDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { ImportDialog } from '@/components/app/ImportDialog';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { ArrowLeftRight, SlidersHorizontal, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/PageHeader';
import { LowStockBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { useBranchOptions, useListQuery, useStockCategories } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { StockItemDetailModal } from './StockItemDetailModal';
import { StockItemFormDialog } from './StockItemFormDialog';
import { StockAdjustDialog } from './StockAdjustDialog';
import { StockTransferDialog } from './StockTransferDialog';
import type { StockTarget } from './stockOperations';

const targetOf = (b: StockBalanceDto): StockTarget => ({
  itemId: b.item.id,
  itemName: b.item.name,
  unit: b.item.unit,
  branchId: b.branch.id,
});

export default function StockBalancesPage() {
  const { can } = useAuth();
  const state = useTableState(['branchId', 'categoryId', 'lowStock']);
  const [importOpen, setImportOpen] = useState(false);
  const result = useListQuery<StockBalanceDto>(qk.stockBalances, '/stock-balances', state.query);
  const branches = useBranchOptions();
  const categories = useStockCategories();
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<StockItemDto | null>(null);
  // Open state is kept apart from the target so a failed save can reopen the same form.
  const [adjust, setAdjust] = useState<{ open: boolean; target: StockTarget | null }>({
    open: false,
    target: null,
  });
  const [transfer, setTransfer] = useState<{ open: boolean; target: StockTarget | null }>({
    open: false,
    target: null,
  });
  const canAdjust = can('inventory.adjust');
  const canTransfer = can('inventory.transfer');

  const columns: ColumnDef<StockBalanceDto>[] = [
    {
      id: 'item',
      header: 'Item',
      meta: { sortKey: 'item' },
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
      meta: { sortKey: 'branch' },
      cell: ({ row }) => `${row.original.branch.code} — ${row.original.branch.name}`,
    },
    {
      id: 'onHand',
      header: 'On hand',
      meta: { align: 'right', sortKey: 'quantityOnHand' },
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
      meta: { align: 'right', sortKey: 'available' },
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
      meta: { align: 'right', exportValue: (b) => b.item.reorderLevel },
      cell: ({ row }) => formatQuantity(row.original.item.reorderLevel),
    },
    {
      id: 'status',
      header: 'Status',
      meta: { exportValue: (b) => (b.isLowStock ? 'Low stock' : 'OK') },
      cell: ({ row }) =>
        row.original.isLowStock ? <LowStockBadge /> : <span className="text-ink-subtle">OK</span>,
    },
    {
      id: 'updatedAt',
      header: 'Last movement',
      meta: { sortKey: 'updatedAt' },
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
        actions={
          (canAdjust || canTransfer) && (
            <>
              {canAdjust && (
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload aria-hidden /> Import opening stock
                </Button>
              )}
              {canTransfer && (
                <Button
                  variant="secondary"
                  onClick={() => setTransfer({ open: true, target: null })}
                >
                  <ArrowLeftRight aria-hidden /> Transfer
                </Button>
              )}
              {canAdjust && (
                <Button onClick={() => setAdjust({ open: true, target: null })}>
                  <SlidersHorizontal aria-hidden /> Adjust stock
                </Button>
              )}
            </>
          )
        }
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import opening stock"
        description="Records starting quantities from your old system. Each item and branch can get an opening balance once, before any other stock movement."
        endpoint="opening-balances"
        templateName="opening-stock"
        invalidate={[qk.stockBalances, qk.stockItems, qk.dashboard]}
        columns={[
          { key: 'sku', header: 'Item code', required: true, example: 'MON-12' },
          { key: 'branchCode', header: 'Branch code', required: true, example: 'HQ' },
          { key: 'quantity', header: 'Quantity', required: true, example: 10 },
          { key: 'unitCost', header: 'Unit cost', example: 2400 },
        ]}
      />
      <DataTable
        exportAll={{ filename: 'stock-balances', path: '/stock-balances', query: state.query }}
        columns={columns}
        result={result}
        state={state}
        getRowId={(b) => b.id}
        onRowClick={can('stock_items.read') ? (b) => setViewItemId(b.item.id) : undefined}
        rowActions={
          canAdjust || canTransfer
            ? (b) => [
                {
                  label: 'Adjust stock',
                  icon: <SlidersHorizontal aria-hidden />,
                  onSelect: () => setAdjust({ open: true, target: targetOf(b) }),
                  hidden: !canAdjust,
                },
                {
                  label: 'Transfer to another branch',
                  icon: <ArrowLeftRight aria-hidden />,
                  onSelect: () => setTransfer({ open: true, target: targetOf(b) }),
                  hidden: !canTransfer,
                },
              ]
            : undefined
        }
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
        emptyDescription="Balances appear once goods are received from a purchase, opening stock is imported, or stock is adjusted or transferred into a branch."
      />
      <StockAdjustDialog
        open={adjust.open}
        target={adjust.target}
        onOpenChange={(open) => setAdjust((s) => ({ ...s, open }))}
      />
      <StockTransferDialog
        open={transfer.open}
        target={transfer.target}
        onOpenChange={(open) => setTransfer((s) => ({ ...s, open }))}
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
