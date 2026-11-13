import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { TENDER_STATUSES, TENDER_STATUS_LABELS, type TenderDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { useOpenParam } from '@/components/app/useOpenParam';
import { BranchFilter } from '@/components/app/BranchControls';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { TenderStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { TenderDetailModal } from './TenderDetailModal';
import { TenderFormDialog } from './TenderFormDialog';
import { useDeleteRecord } from '@/components/app/useDeleteRecord';

export default function TendersPage() {
  const { can } = useAuth();
  const state = useTableState(['status', 'branchId', 'dateFrom', 'dateTo'], { sort: 'scheduleDate:desc' });
  const del = useDeleteRecord<TenderDto>({
    path: '/tenders',
    queryKey: qk.tenders,
    noun: 'price schedule',
    label: (t) => t.number,
    allowed: (t) => canCreate && t.status === 'draft',
  });
  const result = useListQuery<TenderDto>(qk.tenders, '/tenders', state.query);
  const [viewId, setViewId, closeView] = useOpenParam();
  const [form, setForm] = useState<{ open: boolean; tender: TenderDto | null }>({ open: false, tender: null });
  const canCreate = can('tenders.manage');
  const right = { align: 'right' as const, headerClassName: 'text-right' };

  const columns: ColumnDef<TenderDto>[] = [
    {
      id: 'number',
      header: 'Schedule No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    { id: 'scheduleDate', header: 'Date', meta: { sortKey: 'scheduleDate' }, cell: ({ row }) => formatDate(row.original.scheduleDate) },
    { id: 'customerName', header: 'To', meta: { sortKey: 'customerName' }, cell: ({ row }) => row.original.customerName },
    { id: 'tenderReference', header: 'Tender ref', cell: ({ row }) => row.original.tenderReference ?? '—' },
    { id: 'lot', header: 'Lot', cell: ({ row }) => row.original.lot ?? '—' },
    { id: 'items', header: 'Items', meta: right, cell: ({ row }) => row.original.itemCount },
    {
      id: 'total',
      header: 'Grand total',
      meta: { ...right, sortKey: 'total' },
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.total, row.original.currency)}</span>,
    },
    {
      id: 'deadline',
      header: 'Deadline',
      cell: ({ row }) => (row.original.submissionDeadline ? formatDate(row.original.submissionDeadline) : '—'),
    },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <TenderStatusBadge status={row.original.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Tender Price Schedule"
        description="Priced item schedules submitted for tenders. A schedule is not a sale, and is marked awarded only when the award arrives."
        actions={
          canCreate && (
            <Button onClick={() => setForm({ open: true, tender: null })}>
              <Plus aria-hidden /> New price schedule
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(t) => t.id}
        onRowClick={(t) => setViewId(t.id)}
        rowActions={(t) => [
          {
            label: 'Edit',
            icon: <Pencil />,
            hidden: !canCreate || t.status !== 'draft',
            onSelect: () => setForm({ open: true, tender: t }),
          },
          del.action(t),
        ]}
        caption="Price schedules"
        searchPlaceholder="Search number, organisation, tender ref or lot"
        filters={
          <>
            <BranchFilter state={state} />
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={TENDER_STATUSES.map((s) => ({ value: s, label: TENDER_STATUS_LABELS[s] }))}
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
        emptyTitle="No price schedules yet"
        emptyDescription="Create a price schedule to prepare a tender submission."
        emptyAction={
          canCreate && (
            <Button size="sm" onClick={() => setForm({ open: true, tender: null })}>
              <Plus aria-hidden /> New price schedule
            </Button>
          )
        }
      />
      {del.dialog}
      <TenderDetailModal
        tenderId={viewId}
        onOpenChange={(o) => !o && closeView()}
        onEdit={(tender) => {
          closeView();
          setForm({ open: true, tender });
        }}
      />
      {canCreate && (
        <TenderFormDialog
          open={form.open}
          tender={form.tender}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          onSaved={(t) => setViewId(t.id)}
        />
      )}
    </>
  );
}
