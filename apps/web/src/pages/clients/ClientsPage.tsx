import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  CLIENT_STATUSES,
  ORGANIZATION_TYPE_LABELS,
  ORGANIZATION_TYPES,
  type ClientDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterPills, FilterSelect } from '@/components/app/DataTable';
import { exportAction } from '@/components/app/bulkExport';
import { ConfirmDialog } from '@/components/app/dialogs';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { EntityTile, StatStrip, useTotal } from '@/components/app/StatStrip';
import { ClientStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useBranchOptions, useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { ClientDetailModal } from './ClientDetailModal';
import { ClientFormDialog } from './ClientFormDialog';

export default function ClientsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const state = useTableState(['status', 'organizationType', 'branchId'], { sort: 'name:asc' });
  const result = useListQuery<ClientDto>(qk.clients, '/clients', state.query);
  const branches = useBranchOptions();
  const total = useTotal(qk.clients, '/clients');
  const active = useTotal(qk.clients, '/clients', { status: 'active' });
  const archived = useTotal(qk.clients, '/clients', { status: 'archived' });
  const registered = useTotal(qk.registrations, '/registrations', { status: 'active' });

  const [viewId, setViewId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; client: ClientDto | null }>({
    open: false,
    client: null,
  });
  const [archiveTarget, setArchiveTarget] = useState<ClientDto | null>(null);

  const restore = async (client: ClientDto) => {
    try {
      await run(() => api.post(`/clients/${client.id}/restore`), {
        pending: 'Restoring client…',
        success: `${client.name} restored`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.clients });
    } catch {
      /* the feedback dialog already explained the failure */
    }
  };

  const archive = async (client: ClientDto) => {
    try {
      await run(() => api.post(`/clients/${client.id}/archive`), {
        pending: 'Archiving client…',
        success: `${client.name} archived`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.clients });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    } catch {
      /* handled by the feedback dialog */
    }
  };

  const columns: ColumnDef<ClientDto>[] = [
    {
      id: 'name',
      header: 'Client',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <EntityTile text={row.original.name} />
          <CellLink onClick={() => setViewId(row.original.id)} sub={row.original.code}>
            {row.original.name}
          </CellLink>
        </div>
      ),
    },
    {
      id: 'organizationType',
      header: 'Type',
      cell: ({ row }) => ORGANIZATION_TYPE_LABELS[row.original.organizationType],
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div>{row.original.contactPerson ?? '—'}</div>
          <div className="text-xs text-ink-subtle">{row.original.phone ?? row.original.email ?? ''}</div>
        </div>
      ),
    },
    {
      id: 'branch',
      header: 'Branch',
      cell: ({ row }) => row.original.branch?.code ?? <span className="text-ink-subtle">All</span>,
    },
    {
      id: 'registration',
      header: 'Registration',
      cell: ({ row }) =>
        row.original.activeRegistration ? (
          <Badge tone="accent">Registered</Badge>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <ClientStatusBadge status={row.original.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        description="Hospitals, clinics, agencies and other customers."
        actions={
          can('clients.create') && (
            <Button onClick={() => setForm({ open: true, client: null })}>
              <Plus aria-hidden /> New client
            </Button>
          )
        }
      />
      <StatStrip
        stats={[
          { label: 'All clients', value: total.data, caption: 'Active and archived' },
          { label: 'Active', value: active.data, caption: 'Open for new documents', onSelect: () => state.setFilter('status', 'active'), active: state.filters.status === 'active' },
          { label: 'Registered', value: registered.data, caption: 'Hold an active registration' },
          { label: 'Archived', value: archived.data, caption: 'History kept, hidden from new work', onSelect: () => state.setFilter('status', 'archived'), active: state.filters.status === 'archived' },
        ]}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(c) => c.id}
        onRowClick={(c) => setViewId(c.id)}
        caption="Clients"
        searchPlaceholder="Search name, code, contact or email"
        filters={
          <>
            <FilterPills
              label="Status"
              value={state.filters.status}
              onChange={(v) => state.setFilter('status', v)}
              options={CLIENT_STATUSES.map((s) => ({
                value: s,
                label: s === 'active' ? 'Active' : 'Archived',
              }))}
            />
            <FilterSelect
              label="Type"
              value={state.filters.organizationType}
              onChange={(v) => state.setFilter('organizationType', v)}
              options={ORGANIZATION_TYPES.map((t) => ({ value: t, label: ORGANIZATION_TYPE_LABELS[t] }))}
            />
            {(branches.data?.length ?? 0) > 1 && (
              <FilterSelect
                label="Branch"
                value={state.filters.branchId}
                onChange={(v) => state.setFilter('branchId', v)}
                options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
          </>
        }
        bulkActions={[
          exportAction<ClientDto>('client', 'clients.xlsx', [
            { header: 'Code', value: (c) => c.code },
            { header: 'Name', value: (c) => c.name },
            { header: 'Type', value: (c) => ORGANIZATION_TYPE_LABELS[c.organizationType] },
            { header: 'Contact person', value: (c) => c.contactPerson },
            { header: 'Email', value: (c) => c.email },
            { header: 'Telephone', value: (c) => c.phone },
            { header: 'Status', value: (c) => (c.status === 'active' ? 'Active' : 'Archived') },
          ]),
        ]}
        emptyTitle="No clients yet"
        emptyDescription="Add your first client to start preparing proformas and sales."
        emptyAction={
          can('clients.create') && (
            <Button size="sm" onClick={() => setForm({ open: true, client: null })}>
              <Plus aria-hidden /> New client
            </Button>
          )
        }
      />

      <ClientDetailModal
        clientId={viewId}
        menu={(c) => [
          {
            label: 'Edit client',
            icon: <Pencil />,
            onSelect: () => setForm({ open: true, client: c }),
            hidden: !can('clients.update') || c.status !== 'active',
          },
          {
            label: 'Archive client',
            icon: <Archive />,
            onSelect: () => setArchiveTarget(c),
            hidden: !can('clients.archive') || c.status !== 'active',
            destructive: true,
            separatorBefore: true,
          },
          {
            label: 'Restore client',
            icon: <ArchiveRestore />,
            onSelect: () => void restore(c),
            hidden: !can('clients.archive') || c.status !== 'archived',
            separatorBefore: true,
          },
        ]}
        onOpenChange={(o) => !o && setViewId(null)}
        onEdit={(c) => {
          setViewId(null);
          setForm({ open: true, client: c });
        }}
      />
      <ClientFormDialog
        open={form.open}
        client={form.client}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        onSaved={(c) => {
          if (!form.client) toast.message(`Client code ${c.code} assigned`);
        }}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={`Archive ${archiveTarget?.name ?? 'client'}?`}
        description={
          <>
            <p>
              <strong>{archiveTarget?.name}</strong> ({archiveTarget?.code}) will no longer be
              available for new documents. Its history and existing records are kept, and the
              client can be restored later.
            </p>
          </>
        }
        confirmLabel="Archive client"
        destructive
        onConfirm={() => archiveTarget && archive(archiveTarget)}
      />
    </>
  );
}
