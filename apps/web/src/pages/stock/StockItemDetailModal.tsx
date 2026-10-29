import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import {
  STOCK_MOVEMENT_LABELS,
  TRACKING_MODE_LABELS,
  type StockBalanceDto,
  type StockItemDto,
  type StockMovementDto,
} from '@tsm/shared';
import { useAuth, useCurrency } from '@/auth/AuthProvider';
import { DataTable, FilterSelect } from '@/components/app/DataTable';
import { EntityHistory } from '@/components/app/EntityHistory';
import { SectionLoader } from '@/components/app/FullScreenLoader';
import type { RowAction } from '@/components/app/DataTable';
import { DetailList, RecordModal, type RecordTab } from '@/components/app/RecordModal';
import { ActiveBadge, LowStockBadge } from '@/components/app/StatusBadges';
import { EmptyState, ErrorState } from '@/components/app/States';
import { useLocalTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney, formatQuantity } from '@/lib/format';
import { useBranchOptions, useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { StockItemImageManager } from './StockItemImages';

interface Props {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: StockItemDto) => void;
  /** Extra entries for the "…" menu, built from the loaded item. */
  menu?: (item: StockItemDto) => RowAction[];
}

export function StockItemDetailModal({ itemId, onOpenChange, onEdit, menu }: Props) {
  const { can } = useAuth();
  const currency = useCurrency();
  const query = useQuery({
    queryKey: [...qk.stockItems, 'detail', itemId],
    queryFn: ({ signal }) => api.get<StockItemDto>(`/stock-items/${itemId}`, undefined, signal),
    enabled: Boolean(itemId),
  });
  const item = query.data;

  const tabs: RecordTab[] = item
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <div className="space-y-4">
              {item.primaryImageUrl && (
                <img
                  src={item.primaryImageUrl}
                  alt={item.name}
                  className="max-h-48 w-full rounded-xl border border-border bg-surface-muted object-contain"
                />
              )}
              <DetailList
                items={[
                  { label: 'Category', value: item.category?.name ?? 'Uncategorised' },
                  { label: 'Brand / manufacturer', value: item.brand },
                  { label: 'Model', value: item.model },
                  { label: 'Unit of measure', value: item.unit },
                  { label: 'Selling price', value: formatMoney(item.sellingPrice, currency) },
                  ...(can('stock_items.view_cost')
                    ? [
                        {
                          label: 'Purchase cost',
                          value: item.purchaseCost
                            ? formatMoney(item.purchaseCost, currency)
                            : 'Not set',
                        },
                      ]
                    : []),
                  {
                    label: 'On hand (your branches)',
                    value: (
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular">
                          {formatQuantity(item.quantityOnHand)} {item.unit}
                        </span>
                        {item.isLowStock && <LowStockBadge />}
                      </span>
                    ),
                  },
                  { label: 'Reorder level', value: formatQuantity(item.reorderLevel) },
                  { label: 'Tracking', value: TRACKING_MODE_LABELS[item.trackingMode] },
                  {
                    label: 'Warranty',
                    value: item.warrantyMonths !== null ? `${item.warrantyMonths} months` : null,
                  },
                  { label: 'Expiry tracking', value: item.tracksExpiry ? 'Yes' : 'No' },
                  { label: 'Last updated', value: formatDateTime(item.updatedAt) },
                  { label: 'Description', value: item.description, wide: true },
                ]}
              />
            </div>
          ),
        },
        {
          value: 'images',
          label: item.imageCount > 0 ? `Images (${item.imageCount})` : 'Images',
          content: (
            <StockItemImageManager
              itemId={item.id}
              itemName={item.name}
              canEdit={can('stock_items.update')}
            />
          ),
        },
        ...(can('inventory.read')
          ? [
              {
                value: 'balances',
                label: 'Stock by branch',
                content: <BranchBalances item={item} />,
              },
              { value: 'movements', label: 'Movement history', content: <Movements item={item} /> },
            ]
          : []),
        ...(can('audit.read')
          ? [
              {
                value: 'history',
                label: 'Change history',
                content: <EntityHistory entityType="stock_item" entityId={item.id} />,
              },
            ]
          : []),
      ]
    : [];

  return (
    <RecordModal
      open={Boolean(itemId)}
      onOpenChange={onOpenChange}
      title={item?.name ?? 'Stock item'}
      reference={item?.sku}
      status={item && <ActiveBadge active={item.isActive} />}
      loading={query.isLoading}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      tabs={tabs}
      menu={item && menu ? menu(item) : []}
      actions={
        item && can('stock_items.update') ? (
          <Button variant="secondary" onClick={() => onEdit(item)}>
            <Pencil aria-hidden /> Edit
          </Button>
        ) : undefined
      }
    />
  );
}

function BranchBalances({ item }: { item: StockItemDto }) {
  const query = useQuery({
    queryKey: [...qk.stockItems, 'balances', item.id],
    queryFn: ({ signal }) =>
      api.get<StockBalanceDto[]>(`/stock-items/${item.id}/balances`, undefined, signal),
  });
  if (query.isLoading) return <SectionLoader />;
  if (query.isError)
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  if (rows.length === 0)
    return (
      <EmptyState
        title="No stock recorded"
        description="Quantities appear here once goods are received or an opening balance is recorded."
      />
    );
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Stock by branch</caption>
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Branch
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              On hand
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Reserved
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Available
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-3 py-2">
                {b.branch.name} <span className="text-xs text-ink-subtle">{b.branch.code}</span>
              </td>
              <td className="px-3 py-2 text-right tabular">{formatQuantity(b.quantityOnHand)}</td>
              <td className="px-3 py-2 text-right tabular">{formatQuantity(b.quantityReserved)}</td>
              <td className="px-3 py-2 text-right tabular font-medium">
                {formatQuantity(b.quantityAvailable)}
              </td>
              <td className="px-3 py-2">
                {b.isLowStock ? <LowStockBadge /> : <span className="text-ink-subtle">OK</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Movements({ item }: { item: StockItemDto }) {
  const state = useLocalTableState({ pageSize: 10 });
  const branches = useBranchOptions();
  const result = useListQuery<StockMovementDto>(
    [...qk.stockItems, 'movements', item.id],
    `/stock-items/${item.id}/movements`,
    state.query,
  );
  const columns: ColumnDef<StockMovementDto>[] = [
    {
      id: 'occurredAt',
      header: 'Date',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.occurredAt)}</span>
      ),
    },
    { id: 'type', header: 'Movement', cell: ({ row }) => STOCK_MOVEMENT_LABELS[row.original.type] },
    { id: 'branch', header: 'Branch', cell: ({ row }) => row.original.branch.code },
    {
      id: 'quantity',
      header: 'Quantity',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const q = row.original.quantity;
        const negative = q.startsWith('-');
        return (
          <span className={cn('font-medium', negative ? 'text-danger' : 'text-success')}>
            {negative ? '' : '+'}
            {formatQuantity(q)}
          </span>
        );
      },
    },
    { id: 'reference', header: 'Reference', cell: ({ row }) => row.original.reference ?? '—' },
    { id: 'actor', header: 'By', cell: ({ row }) => row.original.actor?.fullName ?? 'System' },
  ];
  return (
    <DataTable
      compact
      columns={columns}
      result={result}
      state={state}
      getRowId={(m) => m.id}
      caption="Stock movement history"
      filters={
        (branches.data?.length ?? 0) > 1 ? (
          <FilterSelect
            label="Branch"
            value={state.filters.branchId}
            onChange={(v) => state.setFilter('branchId', v)}
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
        ) : undefined
      }
      emptyTitle="No stock movements yet"
      emptyDescription="Receipts, issues, transfers and adjustments for this item will be listed here."
    />
  );
}
