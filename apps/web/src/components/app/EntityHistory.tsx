import type { ColumnDef } from '@tanstack/react-table';
import type { AuditEntryDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { DataTable } from './DataTable';
import { useLocalTableState } from './useTableState';

const columns: ColumnDef<AuditEntryDto>[] = [
  {
    id: 'createdAt',
    header: 'When',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-ink-muted">{formatDateTime(row.original.createdAt)}</span>
    ),
  },
  { id: 'summary', header: 'Change', cell: ({ row }) => row.original.summary },
  {
    id: 'actor',
    header: 'By',
    cell: ({ row }) => row.original.actor?.fullName ?? 'System',
  },
];

/** Audit trail for one record. Only rendered for users holding audit.read. */
export function EntityHistory({
  entityType,
  entityId,
  path,
}: {
  entityType?: string;
  entityId?: string;
  /** Override endpoint (e.g. a user's own activity). */
  path?: string;
}) {
  const state = useLocalTableState({ pageSize: 10 });
  const result = useListQuery<AuditEntryDto>(
    [...qk.auditLogs, path ?? `${entityType}:${entityId}`],
    path ?? '/audit-logs',
    path ? state.query : { ...state.query, entityType, entityId },
  );
  return (
    <DataTable
      compact
      columns={columns}
      result={result}
      state={state}
      getRowId={(r) => r.id}
      emptyTitle="No recorded history"
      emptyDescription="Changes to this record will be listed here."
      caption="Change history"
    />
  );
}

export function useCanSeeHistory() {
  return useAuth().can('audit.read');
}
