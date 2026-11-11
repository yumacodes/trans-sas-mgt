import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileDown, Pencil, Plus } from 'lucide-react';
import {
  EXPENSE_KIND_LABELS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  type ExpenseDto,
  type ExpenseKind,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { StatStrip, useTotal } from '@/components/app/StatStrip';
import { ExpenseStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { ExpenseDetailModal } from './ExpenseDetailModal';
import { COUNTERPARTY_LABEL, ExpenseFormDialog } from './ExpenseFormDialog';
import { ExpenseInvoiceDialog } from './ExpenseInvoiceDialog';

const DESCRIPTIONS: Record<ExpenseKind, string> = {
  general: 'Day-to-day business expenses by category and branch.',
  tender_in: 'Money received in connection with tenders, kept apart from customer receipts.',
  tender_out: 'Money paid out in connection with tenders, such as fees and bonds.',
};

export function ExpensesPage({ kind }: { kind: ExpenseKind }) {
  const { can } = useAuth();
  const state = useTableState(['status', 'dateFrom', 'dateTo'], { sort: 'transactionDate:desc' });
  const result = useListQuery<ExpenseDto>([...qk.expenses, kind], '/expenses', { ...state.query, kind });
  const [viewId, setViewId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; expense: ExpenseDto | null }>({ open: false, expense: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const canCreate = can('expenses.manage');
  const label = EXPENSE_KIND_LABELS[kind];
  const newLabel = kind === 'general' ? 'Record expense' : `Record ${label.toLowerCase()}`;

  const total = useTotal([...qk.expenses, kind], '/expenses', { kind });
  const pending = useTotal([...qk.expenses, kind], '/expenses', { kind, status: 'pending' });
  const approved = useTotal([...qk.expenses, kind], '/expenses', { kind, status: 'approved' });
  const closed = useTotal([...qk.expenses, kind], '/expenses', { kind, status: 'rejected' });
  const voided = useTotal([...qk.expenses, kind], '/expenses', { kind, status: 'voided' });

  const right = { align: 'right' as const, headerClassName: 'text-right' };
  const columns: ColumnDef<ExpenseDto>[] = [
    {
      id: 'number',
      header: 'Reference',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    {
      id: 'transactionDate',
      header: 'Date',
      meta: { sortKey: 'transactionDate' },
      cell: ({ row }) => formatDate(row.original.transactionDate),
    },
    ...(kind !== 'general'
      ? [{ id: 'tender', header: 'Tender', cell: ({ row }) => row.original.tenderReference ?? '—' } as ColumnDef<ExpenseDto>]
      : []),
    {
      id: 'counterparty',
      header: COUNTERPARTY_LABEL[kind],
      meta: { sortKey: 'counterparty' },
      cell: ({ row }) => row.original.counterparty ?? <span className="text-ink-subtle">—</span>,
    },
    { id: 'category', header: 'Category', meta: { sortKey: 'category' }, cell: ({ row }) => row.original.category },
    {
      id: 'branch',
      header: 'Branch',
      cell: ({ row }) => row.original.branch?.code ?? <span className="text-ink-subtle">All</span>,
    },
    {
      id: 'amount',
      header: 'Amount',
      meta: { ...right, sortKey: 'amount' },
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.amount, row.original.currency)}</span>,
    },
    { id: 'recordedBy', header: 'Recorded by', cell: ({ row }) => row.original.recordedBy },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <ExpenseStatusBadge status={row.original.status} />,
    },
  ];

  const filterBy = (status: string) => () => state.setFilter('status', state.filters.status === status ? undefined : status);

  return (
    <>
      <PageHeader
        title={kind === 'general' ? 'General Expenses' : label}
        description={DESCRIPTIONS[kind]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              <FileDown aria-hidden /> Generate Invoice
            </Button>
            {canCreate && (
              <Button onClick={() => setForm({ open: true, expense: null })}>
                <Plus aria-hidden /> {newLabel}
              </Button>
            )}
          </>
        }
      />
      <StatStrip
        stats={[
          { label: 'All records', value: total.data, caption: 'Every status' },
          {
            label: 'Pending approval',
            value: pending.data,
            caption: 'Waiting for an approver',
            attention: (pending.data ?? 0) > 0,
            onSelect: filterBy('pending'),
            active: state.filters.status === 'pending',
          },
          {
            label: 'Approved',
            value: approved.data,
            caption: 'Counted in reports',
            onSelect: filterBy('approved'),
            active: state.filters.status === 'approved',
          },
          {
            label: 'Rejected or voided',
            value: closed.data === undefined || voided.data === undefined ? undefined : closed.data + voided.data,
            caption: 'Kept for the record, not counted',
          },
        ]}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(e) => e.id}
        onRowClick={(e) => setViewId(e.id)}
        rowActions={(e) => [
          {
            label: 'Edit',
            icon: <Pencil />,
            hidden: !canCreate || e.status !== 'pending',
            onSelect: () => setForm({ open: true, expense: e }),
          },
        ]}
        caption={label}
        searchPlaceholder="Search reference, category or counterparty"
        filters={
          <>
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={EXPENSE_STATUSES.map((s) => ({ value: s, label: EXPENSE_STATUS_LABELS[s] }))}
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
        emptyTitle="Nothing recorded yet"
        emptyDescription={`Record the first ${label.toLowerCase()} to start tracking it here.`}
        emptyAction={
          canCreate && (
            <Button size="sm" onClick={() => setForm({ open: true, expense: null })}>
              <Plus aria-hidden /> {newLabel}
            </Button>
          )
        }
      />
      <ExpenseInvoiceDialog kind={kind} open={pickerOpen} onOpenChange={setPickerOpen} />
      <ExpenseDetailModal
        expenseId={viewId}
        onOpenChange={(o) => !o && setViewId(null)}
        onEdit={(expense) => {
          setViewId(null);
          setForm({ open: true, expense });
        }}
      />
      {canCreate && (
        <ExpenseFormDialog
          kind={kind}
          open={form.open}
          expense={form.expense}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        />
      )}
    </>
  );
}

export const GeneralExpensesPage = () => <ExpensesPage kind="general" />;
export const TenderInPage = () => <ExpensesPage kind="tender_in" />;
export const TenderOutPage = () => <ExpensesPage kind="tender_out" />;
