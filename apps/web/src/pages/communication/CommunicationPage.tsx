import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Send } from 'lucide-react';
import {
  MESSAGE_AUDIENCE_LABELS,
  MESSAGE_AUDIENCES,
  MESSAGE_STATUSES,
  MESSAGE_STATUS_LABELS,
  type MessageDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { MessageStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCount, formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { ComposeMessage } from './ComposeMessage';
import { MessageDetailModal } from './MessageDetailModal';

/**
 * Communication: send one tailored message to every client, staff user or branch
 * manager, and see exactly what reached whom.
 *
 * Outbound email is an optional server integration. When it is not configured the
 * composer is not shown at all — a button that silently did nothing would be worse
 * than saying plainly that email still needs setting up.
 */
export default function CommunicationPage() {
  const { can } = useAuth();
  const state = useTableState(['audience', 'status'], { sort: 'createdAt:desc' });
  const result = useListQuery<MessageDto>(
    qk.messages,
    '/messages',
    state.query,
    can('messages.read'),
  );
  const [viewId, setViewId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const columns: ColumnDef<MessageDto>[] = [
    {
      id: 'createdAt',
      header: 'Sent',
      meta: { sortKey: 'createdAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'subject',
      header: 'Subject',
      meta: { sortKey: 'subject' },
      cell: ({ row }) => (
        <CellLink onClick={() => setViewId(row.original.id)}>
          <span className="font-medium">{row.original.subject}</span>
        </CellLink>
      ),
    },
    {
      id: 'audience',
      header: 'Audience',
      cell: ({ row }) => MESSAGE_AUDIENCE_LABELS[row.original.audience],
    },
    {
      id: 'recipientCount',
      header: 'Addressed',
      meta: { sortKey: 'recipientCount', align: 'right' },
      cell: ({ row }) => formatCount(row.original.recipientCount),
    },
    {
      id: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone="success">{formatCount(row.original.sentCount)} sent</Badge>
          {row.original.failedCount > 0 && (
            <Badge tone="danger">{formatCount(row.original.failedCount)} failed</Badge>
          )}
          {row.original.skippedCount > 0 && (
            <Badge tone="neutral">{formatCount(row.original.skippedCount)} skipped</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <MessageStatusBadge status={row.original.status} />,
    },
    { id: 'createdBy', header: 'By', cell: ({ row }) => row.original.createdBy?.fullName ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Communication"
        description="Send a tailored message to your clients, your employees or your branch admins, and keep a record of every send."
        actions={
          can('messages.send') && (
            <Button onClick={() => setComposeOpen(true)}>
              <Send aria-hidden /> Send message
            </Button>
          )
        }
      />

      {can('messages.send') && (
        <ComposeMessage open={composeOpen} onOpenChange={setComposeOpen} onSent={(id) => setViewId(id)} />
      )}

      {can('messages.read') && (
        <DataTable
          columns={columns}
          result={result}
          state={state}
          getRowId={(m) => m.id}
          onRowClick={(m) => setViewId(m.id)}
          caption="Messages sent"
          searchPlaceholder="Search by subject"
          filters={
            <>
              <FilterSelect
                label="Audience"
                value={state.filters.audience}
                onChange={(v) => state.setFilter('audience', v)}
                options={MESSAGE_AUDIENCES.map((a) => ({
                  value: a,
                  label: MESSAGE_AUDIENCE_LABELS[a],
                }))}
              />
              <FilterSelect
                label="Status"
                value={state.filters.status}
                onChange={(v) => state.setFilter('status', v)}
                options={MESSAGE_STATUSES.map((s) => ({
                  value: s,
                  label: MESSAGE_STATUS_LABELS[s],
                }))}
              />
            </>
          }
          emptyTitle="No messages sent yet"
          emptyDescription={
            can('messages.send')
              ? 'Messages you send to clients, staff or branch managers are listed here with their delivery outcome.'
              : 'Messages sent to clients, staff or branch managers will be listed here.'
          }
        />
      )}

      <MessageDetailModal messageId={viewId} onOpenChange={(open) => !open && setViewId(null)} />
    </>
  );
}
