import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileDown, Plus } from 'lucide-react';
import { PROFORMA_STATUSES, PROFORMA_STATUS_LABELS, type ProformaDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { ProformaStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { GenerateInvoiceDialog } from './GenerateInvoiceDialog';
import { ProformaDetailModal } from './ProformaDetailModal';
import { ProformaFormDialog } from './ProformaFormDialog';

export default function ProformaPage() {
  const { can } = useAuth();
  const state = useTableState(['status', 'dateFrom', 'dateTo'], { sort: 'issueDate:desc' });
  const result = useListQuery<ProformaDto>(qk.proformas, '/proformas', state.query);
  const [viewId, setViewId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canCreate = can('proformas.manage');

  const right = { align: 'right' as const, headerClassName: 'text-right' };

  const columns: ColumnDef<ProformaDto>[] = [
    {
      id: 'number',
      header: 'Invoice No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>,
    },
    {
      id: 'issueDate',
      header: 'Invoice Date',
      meta: { sortKey: 'issueDate' },
      cell: ({ row }) => formatDate(row.original.issueDate),
    },
    {
      id: 'customerName',
      header: 'Client',
      meta: { sortKey: 'customerName' },
      cell: ({ row }) => row.original.customerName,
    },
    { id: 'items', header: 'No. of Items', meta: right, cell: ({ row }) => row.original.itemCount },
    {
      id: 'amount',
      header: 'Amount',
      meta: right,
      cell: ({ row }) => formatMoney(row.original.subtotal, row.original.currency),
    },
    {
      id: 'vat',
      header: 'VAT',
      meta: right,
      cell: ({ row }) => formatMoney(row.original.vatAmount, row.original.currency),
    },
    {
      id: 'tax',
      header: 'Tax',
      meta: right,
      cell: ({ row }) => formatMoney(row.original.taxAmount, row.original.currency),
    },
    {
      id: 'total',
      header: 'Total',
      meta: { ...right, sortKey: 'total' },
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.total, row.original.currency)}</span>,
    },
    {
      id: 'email',
      header: 'Email',
      cell: ({ row }) =>
        row.original.emailedAt ? (
          <Badge tone="success" dot title={`Emailed ${formatDate(row.original.emailedAt)}`}>
            Sent
          </Badge>
        ) : (
          <span className="text-ink-subtle">Not sent</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      meta: { sortKey: 'status' },
      cell: ({ row }) => <ProformaStatusBadge status={row.original.status} />,
    },
    { id: 'preparedBy', header: 'Prepared By', cell: ({ row }) => row.original.preparedBy },
  ];

  return (
    <>
      <PageHeader
        title="Proforma"
        description="Quotations sent to customers. A proforma does not change stock or count as a sale."
        actions={
          <>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              <FileDown aria-hidden /> Generate Invoice
            </Button>
            {canCreate && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus aria-hidden /> New Proforma
              </Button>
            )}
          </>
        }
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(p) => p.id}
        onRowClick={(p) => setViewId(p.id)}
        caption="Proformas"
        searchPlaceholder="Search invoice number or customer"
        filters={
          <>
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={PROFORMA_STATUSES.map((s) => ({ value: s, label: PROFORMA_STATUS_LABELS[s] }))}
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
        emptyTitle="No proformas yet"
        emptyDescription="Create your first proforma to quote a customer."
        emptyAction={
          canCreate && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus aria-hidden /> New Proforma
            </Button>
          )
        }
      />
      <GenerateInvoiceDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      <ProformaDetailModal proformaId={viewId} onOpenChange={(o) => !o && setViewId(null)} />
      {canCreate && (
        <ProformaFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={(p) => setViewId(p.id)} />
      )}
    </>
  );
}
