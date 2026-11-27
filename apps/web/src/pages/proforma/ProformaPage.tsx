import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileDown, Mail, Pencil, Plus } from 'lucide-react';
import { PROFORMA_SOURCES, PROFORMA_SOURCE_LABELS, PROFORMA_STATUSES, PROFORMA_STATUS_LABELS, type ProformaDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { DateRangeFilter } from '@/components/app/DateRangeFilter';
import { useOpenParam } from '@/components/app/useOpenParam';
import { BranchFilter } from '@/components/app/BranchControls';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { ProformaStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { ProformaDetailModal } from './ProformaDetailModal';
import { ProformaFormDialog } from './ProformaFormDialog';
import { usePdfActions } from '@/components/app/usePdfActions';
import { useDeleteRecord } from '@/components/app/useDeleteRecord';

export default function ProformaPage() {
  return <ProformaListView variant="all" />;
}

/**
 * Requests customers sent from the public website. They are ordinary draft proformas
 * (source "website"), so every proforma feature applies: edit prices, issue, email, PDF,
 * convert to a sale, delete while draft. This view just narrows the list to them.
 */
export function WebsiteRequestsPage() {
  return <ProformaListView variant="website" />;
}

function ProformaListView({ variant }: { variant: 'all' | 'website' }) {
  const website = variant === 'website';
  const { can } = useAuth();
  const state = useTableState(
    website ? ['status', 'branchId', 'dateFrom', 'dateTo'] : ['status', 'source', 'branchId', 'dateFrom', 'dateTo'],
    { sort: 'issueDate:desc' },
  );
  const query = website ? { ...state.query, source: 'website' } : state.query;
  const rowPdf = usePdfActions('/proformas');
  const del = useDeleteRecord<ProformaDto>({
    path: '/proformas',
    queryKey: qk.proformas,
    noun: 'proforma',
    label: (p) => p.number,
    allowed: (p) => canCreate && p.status === 'draft',
  });
  const result = useListQuery<ProformaDto>(qk.proformas, '/proformas', query);
  const [viewId, setViewId, closeView] = useOpenParam();
  const [viewTab, setViewTab] = useState<string | undefined>();
  const [form, setForm] = useState<{ open: boolean; proforma: ProformaDto | null }>({ open: false, proforma: null });
  const canCreate = can('proformas.manage');

  const right = { align: 'right' as const, headerClassName: 'text-right' };

  const columns: ColumnDef<ProformaDto>[] = [
    {
      id: 'number',
      header: 'Invoice No.',
      meta: { sortKey: 'number' },
      cell: ({ row }) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <CellLink onClick={() => setViewId(row.original.id)}>{row.original.number}</CellLink>
          {!website && row.original.source === 'website' && (
            <Badge tone="info" title="Sent by a customer from the website">
              Website
            </Badge>
          )}
        </span>
      ),
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

  if (website) {
    // The customer typed their own contact details; staff call or email straight from the list.
    const contact: ColumnDef<ProformaDto> = {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => (
        <span className="flex flex-col text-xs leading-5">
          {row.original.customerEmail && (
            <a
              className="text-accent hover:underline"
              href={`mailto:${row.original.customerEmail}`}
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.customerEmail}
            </a>
          )}
          {row.original.customerPhone && (
            <a
              className="text-ink-muted hover:underline"
              href={`tel:${row.original.customerPhone.replace(/[^+\d]/g, '')}`}
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.customerPhone}
            </a>
          )}
        </span>
      ),
    };
    const received: ColumnDef<ProformaDto> = {
      id: 'issueDate',
      header: 'Received',
      meta: { sortKey: 'issueDate' },
      cell: ({ row }) => formatDate(row.original.createdAt),
    };
    const keep = ['customerName', 'items', 'total', 'email', 'status'];
    const byId = new Map(columns.map((c) => [c.id, c]));
    columns.splice(0, columns.length, byId.get('number')!, received, ...keep.slice(0, 1).map((k) => byId.get(k)!), contact, ...keep.slice(1).map((k) => byId.get(k)!));
  }

  return (
    <>
      <PageHeader
        title={website ? 'Website Requests' : 'Proforma'}
        description={
          website
            ? 'Product requests customers sent from the website. Each is a draft proforma priced from Stock Items: check prices and availability, then issue it to the customer.'
            : 'Quotations sent to customers. A proforma does not change stock or count as a sale.'
        }
        actions={
          <>
            {canCreate && !website && (
              <Button onClick={() => setForm({ open: true, proforma: null })}>
                <Plus aria-hidden /> New Proforma
              </Button>
            )}
          </>
        }
      />
      <DataTable
        exportAll={{ filename: website ? 'website-requests' : 'proformas', path: '/proformas', query: query }}
        columns={columns}
        result={result}
        state={state}
        getRowId={(p) => p.id}
        onRowClick={(p) => {
          setViewTab(undefined);
          setViewId(p.id);
        }}
        rowActions={(p) => [
          {
            label: 'Edit',
            icon: <Pencil />,
            hidden: !canCreate || !(p.status === 'draft' || p.status === 'issued'),
            onSelect: () => setForm({ open: true, proforma: p }),
          },
          {
            label: 'Send email',
            icon: <Mail />,
            hidden: !canCreate,
            onSelect: () => {
              setViewTab('email');
              setViewId(p.id);
            },
          },
          { label: 'Download PDF', icon: <FileDown />, onSelect: () => void rowPdf.download(p) },
          del.action(p),
        ]}
        caption={website ? 'Website requests' : 'Proformas'}
        searchPlaceholder="Search invoice number or customer"
        filters={
          <>
            <BranchFilter state={state} />
            <FilterSelect
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={PROFORMA_STATUSES.map((s) => ({ value: s, label: PROFORMA_STATUS_LABELS[s] }))}
            />
            {!website && (
              <FilterSelect
                label="Source"
                value={state.filters.source}
                onChange={(v) => state.setFilter('source', v)}
                options={PROFORMA_SOURCES.map((s) => ({ value: s, label: PROFORMA_SOURCE_LABELS[s] }))}
              />
            )}
            <DateRangeFilter
              from={state.filters.dateFrom}
              to={state.filters.dateTo}
              onChange={(from, to) => {
                state.setFilter('dateFrom', from);
                state.setFilter('dateTo', to);
              }}
            />
          </>
        }
        emptyTitle={website ? 'No website requests yet' : 'No proformas yet'}
        emptyDescription={
          website
            ? 'When a customer sends a product request from the website it appears here as a draft proforma, and people who manage proformas are notified.'
            : 'Create your first proforma to quote a customer.'
        }
        emptyAction={
          canCreate &&
          !website && (
            <Button size="sm" onClick={() => setForm({ open: true, proforma: null })}>
              <Plus aria-hidden /> New Proforma
            </Button>
          )
        }
      />
      {del.dialog}
      <ProformaDetailModal
        proformaId={viewId}
        initialTab={viewTab}
        onOpenChange={(o) => !o && closeView()}
        onEdit={(proforma) => {
          closeView();
          setForm({ open: true, proforma });
        }}
      />
      {canCreate && (
        <ProformaFormDialog
          open={form.open}
          proforma={form.proforma}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          onSaved={(p) => {
            setViewTab(undefined);
            setViewId(p.id);
          }}
        />
      )}
    </>
  );
}
