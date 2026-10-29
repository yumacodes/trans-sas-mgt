import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft, Pencil, Plus, X } from 'lucide-react';
import {
  ORGANIZATION_TYPE_LABELS,
  REGISTRATION_STATUSES,
  REGISTRATION_TRANSITIONS,
  type ClientDto,
  type RegistrationDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterPills } from '@/components/app/DataTable';
import { EntityHistory } from '@/components/app/EntityHistory';
import { exportAction } from '@/components/app/bulkExport';
import { PageHeader } from '@/components/app/PageHeader';
import { EntityTile, StatStrip, useTotal } from '@/components/app/StatStrip';
import { DetailList, RecordModal } from '@/components/app/RecordModal';
import {
  REGISTRATION_STATUS_LABELS,
  RegistrationStatusBadge,
} from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import {
  EditRegistrationDialog,
  RegisterClientDialog,
  RegistrationStatusDialog,
} from './RegistrationDialogs';

export default function RegistrationsPage() {
  const { can } = useAuth();
  const canManage = can('registrations.manage');
  const state = useTableState(['status', 'clientId'], { sort: 'registeredOn:desc' });
  const result = useListQuery<RegistrationDto>(qk.registrations, '/registrations', state.query);

  const total = useTotal(qk.registrations, '/registrations');
  const activeCount = useTotal(qk.registrations, '/registrations', { status: 'active' });
  const pendingCount = useTotal(qk.registrations, '/registrations', { status: 'pending' });
  const expiredCount = useTotal(qk.registrations, '/registrations', { status: 'expired' });

  const clientFilter = state.filters.clientId;
  const filterClient = useQuery({
    queryKey: [...qk.clients, 'detail', clientFilter],
    queryFn: ({ signal }) => api.get<ClientDto>(`/clients/${clientFilter}`, undefined, signal),
    enabled: Boolean(clientFilter) && can('clients.read'),
  });

  const initialClient = useMemo(
    () =>
      filterClient.data
        ? { id: filterClient.data.id, code: filterClient.data.code, name: filterClient.data.name }
        : null,
    [filterClient.data],
  );

  const [registerOpen, setRegisterOpen] = useState(false);
  const [view, setView] = useState<RegistrationDto | null>(null);
  const [edit, setEdit] = useState<RegistrationDto | null>(null);
  const [statusTarget, setStatusTarget] = useState<RegistrationDto | null>(null);

  const columns: ColumnDef<RegistrationDto>[] = [
    {
      id: 'registrationNumber',
      header: 'Registration no.',
      meta: { sortKey: 'registrationNumber' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <EntityTile text={row.original.client.name} tone="highlight" />
          <CellLink onClick={() => setView(row.original)}>
            <span className="font-mono">{row.original.registrationNumber}</span>
          </CellLink>
        </div>
      ),
    },
    {
      id: 'client',
      header: 'Client',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.client.name}</div>
          <div className="text-xs text-ink-subtle">
            {row.original.client.code} · {ORGANIZATION_TYPE_LABELS[row.original.client.organizationType]}
          </div>
        </div>
      ),
    },
    {
      id: 'registeredOn',
      header: 'Registered',
      meta: { sortKey: 'registeredOn' },
      cell: ({ row }) => formatDate(row.original.registeredOn),
    },
    {
      id: 'validUntil',
      header: 'Valid until',
      meta: { sortKey: 'validUntil' },
      cell: ({ row }) => (row.original.validUntil ? formatDate(row.original.validUntil) : 'No end date'),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <RegistrationStatusBadge status={row.original.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Registered Clients"
        description="Client registrations, their validity and status."
        actions={
          canManage && (
            <Button onClick={() => setRegisterOpen(true)}>
              <Plus aria-hidden /> Register client
            </Button>
          )
        }
      />
      {clientFilter && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/25 bg-accent-soft px-3 py-2 text-sm">
          Showing registrations for{' '}
          <strong>{filterClient.data?.name ?? 'the selected client'}</strong>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => state.setFilter('clientId', undefined)}
          >
            <X aria-hidden /> Show all
          </Button>
        </div>
      )}
      <StatStrip
        stats={[
          { label: 'Registrations', value: total.data, caption: 'All statuses' },
          { label: 'Active', value: activeCount.data, caption: 'Currently valid', onSelect: () => state.setFilter('status', 'active'), active: state.filters.status === 'active' },
          { label: 'Pending', value: pendingCount.data, caption: 'Awaiting activation', onSelect: () => state.setFilter('status', 'pending'), active: state.filters.status === 'pending' },
          { label: 'Expired', value: expiredCount.data, caption: 'Past their end date', onSelect: () => state.setFilter('status', 'expired'), active: state.filters.status === 'expired' },
        ]}
      />
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(r) => r.id}
        onRowClick={(r) => setView(r)}
        caption="Client registrations"
        searchPlaceholder="Search registration number or client"
        filters={
          <FilterPills
            label="Status"
            value={state.filters.status}
            onChange={(v) => state.setFilter('status', v)}
            options={REGISTRATION_STATUSES.map((s) => ({ value: s, label: REGISTRATION_STATUS_LABELS[s] }))}
          />
        }
        bulkActions={[
          exportAction<RegistrationDto>('registration', 'registered-clients.xlsx', [
            { header: 'Registration no.', value: (r) => r.registrationNumber },
            { header: 'Client code', value: (r) => r.client.code },
            { header: 'Client', value: (r) => r.client.name },
            { header: 'Email', value: (r) => r.client.email },
            { header: 'Telephone', value: (r) => r.client.phone },
            { header: 'Registered on', value: (r) => r.registeredOn },
            { header: 'Valid until', value: (r) => r.validUntil },
            { header: 'Status', value: (r) => REGISTRATION_STATUS_LABELS[r.status] },
          ]),
        ]}
        emptyTitle="No registered clients yet"
        emptyDescription="Register an existing client to record its registration number and validity."
        emptyAction={
          canManage && (
            <Button size="sm" onClick={() => setRegisterOpen(true)}>
              <Plus aria-hidden /> Register client
            </Button>
          )
        }
      />

      <RecordModal
        open={Boolean(view)}
        menu={
          view
            ? [
                {
                  label: 'Edit registration',
                  icon: <Pencil />,
                  onSelect: () => setEdit(view),
                  hidden: !canManage || view.status === 'revoked',
                },
                {
                  label: 'Change status',
                  icon: <ArrowRightLeft />,
                  onSelect: () => setStatusTarget(view),
                  hidden: !canManage || REGISTRATION_TRANSITIONS[view.status].length === 0,
                },
              ]
            : []
        }
        onOpenChange={(o) => !o && setView(null)}
        title={view?.client.name ?? 'Registration'}
        reference={view?.registrationNumber}
        status={view && <RegistrationStatusBadge status={view.status} />}
        tabs={
          view
            ? [
                {
                  value: 'overview',
                  label: 'Overview',
                  content: (
                    <DetailList
                      items={[
                        { label: 'Client', value: `${view.client.name} (${view.client.code})` },
                        {
                          label: 'Organization type',
                          value: ORGANIZATION_TYPE_LABELS[view.client.organizationType],
                        },
                        { label: 'Contact person', value: view.client.contactPerson },
                        { label: 'Telephone', value: view.client.phone },
                        { label: 'Email', value: view.client.email },
                        { label: 'Registration date', value: formatDate(view.registeredOn) },
                        {
                          label: 'Valid until',
                          value: view.validUntil ? formatDate(view.validUntil) : 'No end date',
                        },
                        { label: 'Recorded', value: formatDateTime(view.createdAt) },
                        { label: 'Notes', value: view.notes, wide: true },
                      ]}
                    />
                  ),
                },
                ...(can('audit.read')
                  ? [
                      {
                        value: 'history',
                        label: 'History',
                        content: <EntityHistory entityType="client_registration" entityId={view.id} />,
                      },
                    ]
                  : []),
              ]
            : []
        }
        actions={
          view && canManage ? (
            <>
              {REGISTRATION_TRANSITIONS[view.status].length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStatusTarget(view);
                    setView(null);
                  }}
                >
                  <ArrowRightLeft aria-hidden /> Change status
                </Button>
              )}
              {view.status !== 'revoked' && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEdit(view);
                    setView(null);
                  }}
                >
                  <Pencil aria-hidden /> Edit
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <RegisterClientDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        initialClient={initialClient}
      />
      <EditRegistrationDialog registration={edit} onOpenChange={(o) => !o && setEdit(null)} />
      <RegistrationStatusDialog
        registration={statusTarget}
        onOpenChange={(o) => !o && setStatusTarget(null)}
      />
    </>
  );
}
