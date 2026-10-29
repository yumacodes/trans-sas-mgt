import type { ColumnDef } from '@tanstack/react-table';
import type { AuditEntryDto } from '@tsm/shared';
import { DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';

/** Entity types written by the API's audit service. */
const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'client_registration', label: 'Registration' },
  { value: 'stock_item', label: 'Stock item' },
  { value: 'stock_category', label: 'Stock category' },
  { value: 'branch', label: 'Branch' },
  { value: 'user', label: 'User' },
  { value: 'role', label: 'Role' },
  { value: 'company', label: 'Company profile' },
];

const LABELS = Object.fromEntries(ENTITY_TYPES.map((e) => [e.value, e.label]));

const columns: ColumnDef<AuditEntryDto>[] = [
  {
    id: 'createdAt',
    header: 'When',
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>,
  },
  {
    id: 'actor',
    header: 'User',
    cell: ({ row }) => row.original.actor?.fullName ?? <span className="text-ink-subtle">System</span>,
  },
  {
    id: 'entityType',
    header: 'Record type',
    cell: ({ row }) => <Badge>{LABELS[row.original.entityType] ?? row.original.entityType}</Badge>,
  },
  {
    id: 'action',
    header: 'Action',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
  },
  { id: 'summary', header: 'Summary', cell: ({ row }) => row.original.summary },
];

export default function AuditLogPage() {
  const state = useTableState(['entityType', 'entityId', 'actorId']);
  const result = useListQuery<AuditEntryDto>(qk.auditLogs, '/audit-logs', state.query);
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="A read-only record of significant changes, who made them and when."
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(e) => e.id}
        caption="Audit log"
        searchPlaceholder="Search summaries"
        filters={
          <FilterSelect
            label="Record type"
            value={state.filters.entityType}
            onChange={(v) => state.setFilter('entityType', v)}
            options={ENTITY_TYPES}
          />
        }
        emptyTitle="No audit entries yet"
        emptyDescription="Changes to records and settings are recorded here automatically."
      />
    </>
  );
}
