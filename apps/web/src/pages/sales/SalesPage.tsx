import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, FileDown } from 'lucide-react';
import { SALE_STATUSES, SALE_STATUS_LABELS, type SaleDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { BranchFilter } from '@/components/app/BranchControls';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { SaleStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { SaleDetailModal } from './SaleDetailModal';
import { SaleFormDialog } from './SaleFormDialog';
import { usePdfActions } from '@/components/app/usePdfActions';
import { useDeleteRecord } from '@/components/app/useDeleteRecord';

export default function SalesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const state = useTableState(['status', 'branchId', 'dateFrom', 'dateTo'], { sort: 'saleDate:desc' });
  const rowPdf = usePdfActions('/sales');
  const del = useDeleteRecord<SaleDto>({
    path: '/sales',
    queryKey: qk.sales,
    noun: 'sale',
    label: (s) => s.number,
    allowed: (s) => canCreate && s.status === 'draft',
  });
  const result = useListQuery<SaleDto>(qk.sales, '/sales', state.query);
  // `?open=` lets a conversion from another page land on the new sale.
  const [viewId, setViewId] = useState<string | null>(params.get('open'));
  const [form, setForm] = useState<{ open: boolean; sale: SaleDto | null }>({ open: false, sale: null });
  const canCreate = can('sales.manage');
  const right = { align: 'right' as const, headerClassName: 'text-right' };

  const closeView = () => {
    setViewId(null);
    if (params.has('open')) {
      const next = new URLSearchParams(params);
      next.delete('open');
      setParams(next, { replace: true });
    }
  };

  const columns: ColumnDef<SaleDto>[] = [
    {
      id: 'number',
      header: 'Sale No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    { id: 'saleDate', header: 'Date', meta: { sortKey: 'saleDate' }, cell: ({ row }) => formatDate(row.original.saleDate) },
    { id: 'customerName', header: 'Client', meta: { sortKey: 'customerName' }, cell: ({ row }) => row.original.customerName },
    { id: 'branch', header: 'Branch', cell: ({ row }) => row.original.branch?.code ?? '—' },
    { id: 'items', header: 'Items', meta: right, cell: ({ row }) => row.original.itemCount },
    {
      id: 'total',
      header: 'Total',
      meta: { ...right, sortKey: 'total' },
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.total, row.original.currency)}</span>,
    },
    {
      id: 'balance',
      header: 'Balance',
      meta: right,
      cell: ({ row }) =>
        row.original.status === 'confirmed' ? formatMoney(row.original.balance, row.original.currency) : '—',
    },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <SaleStatusBadge status={row.original.status} />,
    },
  ];

  const newButton = (size?: 'sm') =>
    canCreate && (
      <Button size={size} onClick={() => setForm({ open: true, sale: null })}>
        <Plus aria-hidden /> New sale
      </Button>
    );

  return (
    <>
      <PageHeader
        title="Sales"
        description="A draft changes nothing. Confirming a sale takes its stock off and opens it for payment."
        actions={newButton()}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(s) => s.id}
        onRowClick={(s) => setViewId(s.id)}
        rowActions={(s) => [
          {
            label: 'Edit',
            icon: <Pencil />,
            hidden: !canCreate || s.status !== 'draft',
            onSelect: () => setForm({ open: true, sale: s }),
          },
          { label: 'Download PDF', icon: <FileDown />, onSelect: () => void rowPdf.download(s) },
          del.action(s),
        ]}
        caption="Sales"
        searchPlaceholder="Search sale number or client"
        filters={
          <>
            <BranchFilter state={state} />
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={SALE_STATUSES.map((s) => ({ value: s, label: SALE_STATUS_LABELS[s] }))}
            />
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              From
              <Input
                type="date"
                aria-label="From date"
                className="h-10 w-auto"
                value={state.filters.dateFrom ?? ''}
                max={state.filters.dateTo || undefined}
                onChange={(e) => state.setFilter('dateFrom', e.target.value || undefined)}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              To
              <Input
                type="date"
                aria-label="To date"
                className="h-10 w-auto"
                value={state.filters.dateTo ?? ''}
                min={state.filters.dateFrom || undefined}
                onChange={(e) => state.setFilter('dateTo', e.target.value || undefined)}
              />
            </label>
          </>
        }
        emptyTitle="No sales yet"
        emptyDescription="Create a sale, or convert an accepted proforma or awarded tender."
        emptyAction={newButton('sm')}
      />
      {del.dialog}
      <SaleDetailModal
        saleId={viewId}
        onOpenChange={(o) => !o && closeView()}
        onEdit={(sale) => {
          closeView();
          setForm({ open: true, sale });
        }}
      />
      {canCreate && (
        <SaleFormDialog
          open={form.open}
          sale={form.sale}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        />
      )}
    </>
  );
}
