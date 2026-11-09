import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { ACCEPTANCE_STATUSES, ACCEPTANCE_STATUS_LABELS, type AcceptanceDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { AcceptanceStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { AcceptanceDetailModal } from './AcceptanceDetailModal';
import { AcceptanceFormDialog } from './AcceptanceFormDialog';

export default function AcceptancePage() {
  const { can } = useAuth();
  const state = useTableState(['status', 'dateFrom', 'dateTo'], { sort: 'letterDate:desc' });
  const result = useListQuery<AcceptanceDto>(qk.acceptanceLetters, '/acceptance-letters', state.query);
  const [viewId, setViewId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; letter: AcceptanceDto | null }>({ open: false, letter: null });
  const canCreate = can('acceptance.manage');

  const columns: ColumnDef<AcceptanceDto>[] = [
    {
      id: 'number',
      header: 'Our Ref',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    { id: 'letterDate', header: 'Date', meta: { sortKey: 'letterDate' }, cell: ({ row }) => formatDate(row.original.letterDate) },
    { id: 'recipientName', header: 'To', meta: { sortKey: 'recipientName' }, cell: ({ row }) => row.original.recipientName },
    { id: 'contractNumber', header: 'Contract No.', cell: ({ row }) => row.original.contractNumber },
    { id: 'supply', header: 'Supply of', cell: ({ row }) => row.original.supplyDescription },
    { id: 'tender', header: 'Price schedule', cell: ({ row }) => row.original.tender?.number ?? '—' },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <AcceptanceStatusBadge status={row.original.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Acceptance Letter"
        description="Letters accepting contract awards. A letter is a draft until you mark it issued."
        actions={
          canCreate && (
            <Button onClick={() => setForm({ open: true, letter: null })}>
              <Plus aria-hidden /> New acceptance letter
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(l) => l.id}
        onRowClick={(l) => setViewId(l.id)}
        caption="Acceptance letters"
        searchPlaceholder="Search ref, recipient or contract number"
        filters={
          <>
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={ACCEPTANCE_STATUSES.map((s) => ({ value: s, label: ACCEPTANCE_STATUS_LABELS[s] }))}
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
        emptyTitle="No acceptance letters yet"
        emptyDescription="Create a letter when a contract award arrives."
        emptyAction={
          canCreate && (
            <Button size="sm" onClick={() => setForm({ open: true, letter: null })}>
              <Plus aria-hidden /> New acceptance letter
            </Button>
          )
        }
      />
      <AcceptanceDetailModal
        letterId={viewId}
        onOpenChange={(o) => !o && setViewId(null)}
        onEdit={(letter) => {
          setViewId(null);
          setForm({ open: true, letter });
        }}
      />
      {canCreate && (
        <AcceptanceFormDialog
          open={form.open}
          letter={form.letter}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          onSaved={(l) => setViewId(l.id)}
        />
      )}
    </>
  );
}
