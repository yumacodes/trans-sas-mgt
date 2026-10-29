import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FolderTree, Plus, Power, PowerOff } from 'lucide-react';
import type { StockItemDto } from '@tsm/shared';
import { useAuth, useCurrency } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterPills, FilterSelect } from '@/components/app/DataTable';
import { exportAction } from '@/components/app/bulkExport';
import { ConfirmDialog } from '@/components/app/dialogs';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { EntityTile, StatStrip, useTotal } from '@/components/app/StatStrip';
import { ActiveBadge, LowStockBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatMoney, formatQuantity } from '@/lib/format';
import { useListQuery, useStockCategories } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { CategoriesDialog } from './CategoriesDialog';
import { StockItemDetailModal } from './StockItemDetailModal';
import { StockItemFormDialog } from './StockItemFormDialog';

export default function StockItemsPage() {
  const { can } = useAuth();
  const currency = useCurrency();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const state = useTableState(['categoryId', 'isActive', 'lowStock'], { sort: 'name:asc' });
  const result = useListQuery<StockItemDto>(qk.stockItems, '/stock-items', state.query);
  const categories = useStockCategories();
  const total = useTotal(qk.stockItems, '/stock-items');
  const activeCount = useTotal(qk.stockItems, '/stock-items', { isActive: 'true' });
  const lowCount = useTotal(qk.stockItems, '/stock-items', { isActive: 'true', lowStock: 'true' });
  const inactiveCount = useTotal(qk.stockItems, '/stock-items', { isActive: 'false' });

  const [viewId, setViewId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; item: StockItemDto | null }>({
    open: false,
    item: null,
  });
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StockItemDto | null>(null);

  const setStatus = async (item: StockItemDto, isActive: boolean) => {
    try {
      await run(() => api.patch(`/stock-items/${item.id}/status`, { isActive }), {
        pending: isActive ? 'Activating item…' : 'Deactivating item…',
        success: `${item.sku} ${isActive ? 'activated' : 'deactivated'}`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.stockItems });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    } catch {
      /* explained in the feedback dialog */
    }
  };

  const columns: ColumnDef<StockItemDto>[] = [
    {
      id: 'sku',
      header: 'Item code',
      meta: { sortKey: 'sku' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <ItemThumbnail item={row.original} />
          <CellLink onClick={() => setViewId(row.original.id)}>
            <span className="font-mono">{row.original.sku}</span>
          </CellLink>
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium">{row.original.name}</div>
          <div className="truncate text-xs text-ink-subtle">
            {[row.original.brand, row.original.model].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
    },
    { id: 'category', header: 'Category', cell: ({ row }) => row.original.category?.name ?? '—' },
    {
      id: 'sellingPrice',
      header: 'Selling price',
      meta: { sortKey: 'sellingPrice', align: 'right' },
      cell: ({ row }) => formatMoney(row.original.sellingPrice, currency),
    },
    {
      id: 'quantityOnHand',
      header: 'On hand',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span>
          {formatQuantity(row.original.quantityOnHand)}{' '}
          <span className="text-xs text-ink-subtle">{row.original.unit}</span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <ActiveBadge active={row.original.isActive} />
          {row.original.isActive && row.original.isLowStock && <LowStockBadge />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Items"
        description="The medical equipment catalogue, prices and stock levels."
        actions={
          <>
            {(can('stock_items.create') || can('stock_items.update')) && (
              <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
                <FolderTree aria-hidden /> Categories
              </Button>
            )}
            {can('stock_items.create') && (
              <Button onClick={() => setForm({ open: true, item: null })}>
                <Plus aria-hidden /> New item
              </Button>
            )}
          </>
        }
      />
      <StatStrip
        stats={[
          { label: 'Catalogue items', value: total.data, caption: 'Active and inactive' },
          {
            label: 'Active',
            value: activeCount.data,
            caption: 'Available for documents',
            onSelect: () => state.setFilter('isActive', 'true'),
            active: state.filters.isActive === 'true',
          },
          {
            label: 'Low stock',
            value: lowCount.data,
            caption: 'At or below reorder level',
            attention: true,
            onSelect: () => state.setFilter('lowStock', 'true'),
            active: state.filters.lowStock === 'true',
          },
          {
            label: 'Inactive',
            value: inactiveCount.data,
            caption: 'Hidden from new documents',
            onSelect: () => state.setFilter('isActive', 'false'),
            active: state.filters.isActive === 'false',
          },
        ]}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(i) => i.id}
        onRowClick={(i) => setViewId(i.id)}
        caption="Stock items"
        searchPlaceholder="Search code, name, brand or model"
        filters={
          <>
            <FilterSelect
              label="Category"
              value={state.filters.categoryId}
              onChange={(v) => state.setFilter('categoryId', v)}
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterPills
              label="Status"
              value={state.filters.isActive}
              onChange={(v) => state.setFilter('isActive', v)}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
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
        bulkActions={[
          exportAction<StockItemDto>('item', 'stock-items.xlsx', [
            { header: 'SKU', value: (i) => i.sku },
            { header: 'Name', value: (i) => i.name },
            { header: 'Category', value: (i) => i.category?.name },
            { header: 'Brand', value: (i) => i.brand },
            { header: 'Model', value: (i) => i.model },
            { header: 'Unit', value: (i) => i.unit },
            { header: 'Selling price', value: (i) => i.sellingPrice },
            { header: 'Reorder level', value: (i) => i.reorderLevel },
            { header: 'On hand', value: (i) => i.quantityOnHand },
            { header: 'Status', value: (i) => (i.isActive ? 'Active' : 'Inactive') },
          ]),
        ]}
        emptyTitle="No stock items yet"
        emptyDescription="Add the equipment you sell to build your catalogue."
        emptyAction={
          can('stock_items.create') && (
            <Button size="sm" onClick={() => setForm({ open: true, item: null })}>
              <Plus aria-hidden /> New item
            </Button>
          )
        }
      />

      <StockItemDetailModal
        itemId={viewId}
        menu={(i) => [
          {
            label: i.isActive ? 'Deactivate item' : 'Activate item',
            icon: i.isActive ? <PowerOff /> : <Power />,
            onSelect: () => setStatusTarget(i),
            hidden: !can('stock_items.update'),
            destructive: i.isActive,
          },
        ]}
        onOpenChange={(o) => !o && setViewId(null)}
        onEdit={(i) => {
          setViewId(null);
          setForm({ open: true, item: i });
        }}
      />
      <StockItemFormDialog
        open={form.open}
        item={form.item}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
      />
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        title={`Deactivate ${statusTarget?.sku ?? 'item'}?`}
        description={
          <p>
            <strong>{statusTarget?.name}</strong> will no longer be offered on new documents. Its
            stock records and history are kept, and it can be reactivated later.
          </p>
        }
        confirmLabel="Deactivate item"
        destructive
        onConfirm={() => statusTarget && setStatus(statusTarget, false)}
      />
    </>
  );
}

/** The item's first photograph, falling back to its initials. */
function ItemThumbnail({ item }: { item: StockItemDto }) {
  if (!item.primaryImageUrl) return <EntityTile text={item.name} tone="info" />;
  return (
    <img
      src={item.primaryImageUrl}
      alt=""
      className="size-9 shrink-0 rounded-2xl border border-border object-cover"
      loading="lazy"
    />
  );
}
