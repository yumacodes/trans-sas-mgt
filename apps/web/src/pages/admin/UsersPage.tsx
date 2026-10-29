import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AtSign,
  CalendarDays,
  Clock,
  GitBranch,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import type { UserDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect, type RowAction } from '@/components/app/DataTable';
import { exportAction } from '@/components/app/bulkExport';
import { ConfirmDialog } from '@/components/app/dialogs';
import { EntityHistory } from '@/components/app/EntityHistory';
import { useOperation } from '@/components/app/OperationFeedback';
import { PageHeader } from '@/components/app/PageHeader';
import { InfoRows, ProfileModal } from '@/components/app/ProfileModal';
import { ActiveBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useListQuery, useResetRequests, useRoles } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { initials } from '@/lib/utils';
import { CreateUserDialog, EditUserDialog, TemporaryPasswordDialog, UserAccessDialog } from './UserDialogs';

type Confirm =
  | { kind: 'deactivate'; user: UserDto }
  | { kind: 'activate'; user: UserDto };

export default function UsersPage() {
  const { me, can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const state = useTableState(['isActive', 'roleId'], { sort: 'fullName:asc' });
  const result = useListQuery<UserDto>(qk.users, '/users', state.query);
  const roles = useRoles();

  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [edit, setEdit] = useState<UserDto | null>(null);
  const [access, setAccess] = useState<UserDto | null>(null);
  const [tempPassword, setTempPassword] = useState<Pick<UserDto, 'id' | 'fullName'> | null>(null);
  const resetRequests = useResetRequests().data ?? [];
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const perform = async (c: Confirm) => {
    const { user } = c;
    try {
      const isActive = c.kind === 'activate';
      await run(() => api.patch(`/users/${user.id}/status`, { isActive }), {
        pending: isActive ? 'Activating account…' : 'Deactivating account…',
        success: `${user.fullName} ${isActive ? 'activated' : 'deactivated'}`,
      });
      void queryClient.invalidateQueries({ queryKey: qk.users });
    } catch {
      /* explained in the feedback dialog */
    }
  };

  const isSelf = (u: UserDto) => u.id === me?.user.id;

  const actionsFor = (u: UserDto) => [
    { label: 'Edit profile', icon: <Pencil />, onSelect: () => setEdit(u) },
    { label: 'Roles & branches', icon: <ShieldCheck />, onSelect: () => setAccess(u), hidden: isSelf(u) },
    {
      label: 'Set temporary password',
      icon: <KeyRound />,
      onSelect: () => setTempPassword(u),
      hidden: !u.isActive,
    },
    {
      label: 'Deactivate',
      icon: <PowerOff />,
      onSelect: () => setConfirm({ kind: 'deactivate', user: u }),
      hidden: !u.isActive || isSelf(u),
      destructive: true,
      separatorBefore: true,
    },
    {
      label: 'Activate',
      icon: <Power />,
      onSelect: () => setConfirm({ kind: 'activate', user: u }),
      hidden: u.isActive,
      separatorBefore: true,
    },
  ];

  const columns: ColumnDef<UserDto>[] = [
    {
      id: 'fullName',
      header: 'User',
      meta: { sortKey: 'fullName' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px]">{initials(row.original.fullName)}</AvatarFallback>
          </Avatar>
          <CellLink onClick={() => setViewId(row.original.id)} sub={`@${row.original.username} · ${row.original.email}`}>
            {row.original.fullName}
            {isSelf(row.original) && <span className="ml-1 text-xs font-normal text-ink-subtle">(you)</span>}
          </CellLink>
        </div>
      ),
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((r) => (
            <Badge key={r.id} tone="accent">
              {r.name}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: 'branches',
      header: 'Branches',
      cell: ({ row }) =>
        row.original.branches.length ? row.original.branches.map((b) => b.code).join(', ') : '—',
    },
    { id: 'status', header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
  ];

  const target = confirm?.user;

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts, their roles and branch access."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> New user
          </Button>
        }
      />
      {resetRequests.length > 0 && (
        <section
          aria-label="Password reset requests"
          className="mb-4 rounded-3xl border border-danger/20 bg-danger-soft/50 p-5"
        >
          <h2 className="text-sm font-semibold text-ink">
            {resetRequests.length === 1
              ? '1 person is waiting for a password reset'
              : `${resetRequests.length} people are waiting for a password reset`}
          </h2>
          <ul className="mt-3 divide-y divide-border/70">
            {resetRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.user.fullName} <span className="font-normal text-ink-subtle">· {r.user.username}</span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {r.user.email} · requested {formatRelative(r.requestedAt)}
                  </p>
                </div>
                <Button size="sm" variant="dark" onClick={() => setTempPassword(r.user)}>
                  <KeyRound aria-hidden /> Set temporary password
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <DataTable
        columns={columns}
        result={result}
        state={state}
        getRowId={(u) => u.id}
        onRowClick={(u) => setViewId(u.id)}
        caption="Users"
        searchPlaceholder="Search name, username or email"
        filters={
          <>
            <FilterSelect
              label="Status"
              value={state.filters.isActive}
              onChange={(v) => state.setFilter('isActive', v)}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
            />
            <FilterSelect
              label="Role"
              value={state.filters.roleId}
              onChange={(v) => state.setFilter('roleId', v)}
              options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
            />
          </>
        }
        bulkActions={[
          exportAction<UserDto>('user', 'users.xlsx', [
            { header: 'Name', value: (u) => u.fullName },
            { header: 'Username', value: (u) => u.username },
            { header: 'Email', value: (u) => u.email },
            { header: 'Phone', value: (u) => u.phone },
            { header: 'Roles', value: (u) => u.roles.map((r) => r.name).join('; ') },
            { header: 'Branches', value: (u) => u.branches.map((b) => b.code).join('; ') },
            { header: 'Status', value: (u) => (u.isActive ? 'Active' : 'Inactive') },
          ]),
        ]}
        emptyTitle="No users found"
      />

      <UserDetailModal
        userId={viewId}
        onOpenChange={(o) => !o && setViewId(null)}
        canSeeActivity={can('audit.read')}
        onEdit={(u) => {
          setViewId(null);
          setEdit(u);
        }}
        menu={(u) =>
          actionsFor(u).map((m) => ({
            ...m,
            // Close the profile first so the next dialog doesn't stack on top of it.
            onSelect: () => {
              setViewId(null);
              m.onSelect();
            },
          }))
        }
      />
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog user={edit} onOpenChange={(o) => !o && setEdit(null)} />
      <TemporaryPasswordDialog user={tempPassword} onClose={() => setTempPassword(null)} />
      <UserAccessDialog user={access} onOpenChange={(o) => !o && setAccess(null)} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === 'deactivate'
            ? `Deactivate ${target?.fullName}?`
            : `Activate ${target?.fullName}?`
        }
        description={
          confirm?.kind === 'deactivate' ? (
            <p>
              <strong>{target?.email}</strong> will be signed out and won&apos;t be able to sign in.
              Records they created are kept. You can reactivate the account later.
            </p>
          ) : (
            <p>
              <strong>{target?.email}</strong> will be able to sign in again with their existing
              roles.
            </p>
          )
        }
        confirmLabel={
          confirm?.kind === 'deactivate'
            ? 'Deactivate account'
            : 'Activate account'
        }
        destructive={confirm?.kind === 'deactivate'}
        onConfirm={() => confirm && perform(confirm)}
      />
    </>
  );
}

function UserDetailModal({
  userId,
  onOpenChange,
  canSeeActivity,
  onEdit,
  menu,
}: {
  userId: string | null;
  onOpenChange: (o: boolean) => void;
  canSeeActivity: boolean;
  onEdit: (u: UserDto) => void;
  menu: (u: UserDto) => RowAction[];
}) {
  const query = useQuery({
    queryKey: [...qk.users, 'detail', userId],
    queryFn: ({ signal }) => api.get<UserDto>(`/users/${userId}`, undefined, signal),
    enabled: Boolean(userId),
  });
  const u = query.data;
  return (
    <ProfileModal
      open={Boolean(userId)}
      onOpenChange={onOpenChange}
      label="User overview"
      name={u?.fullName ?? ''}
      subtitle={u ? u.roles.map((r) => r.name).join(', ') || 'No role assigned' : undefined}
      presence={u ? (u.isActive ? 'active' : 'inactive') : undefined}
      primary={u ? { label: 'Send email', icon: <Mail />, href: `mailto:${u.email}` } : undefined}
      quickActions={u ? [{ label: 'Edit profile', icon: <Pencil />, onClick: () => onEdit(u) }] : []}
      menu={u ? menu(u).filter((m) => m.label !== 'Edit profile') : []}
      loading={query.isLoading}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      tabs={
        u
          ? [
              {
                value: 'info',
                label: 'Info',
                content: (
                  <InfoRows
                    items={[
                      { icon: <Tag />, label: 'Status', value: <ActiveBadge active={u.isActive} /> },
                      { icon: <AtSign />, label: 'Username', value: u.username },
                      { icon: <Mail />, label: 'Email', value: u.email },
                      { icon: <Phone />, label: 'Phone', value: u.phone },
                      {
                        icon: <ShieldCheck />,
                        label: 'Roles',
                        value: (
                          <span className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <Badge key={r.id} tone="accent">
                                {r.name}
                              </Badge>
                            ))}
                          </span>
                        ),
                      },
                      {
                        icon: <GitBranch />,
                        label: 'Branches',
                        value: u.branches.length
                          ? u.branches.map((b) => `${b.code} — ${b.name}`).join('\n')
                          : 'None assigned',
                      },
                      { icon: <CalendarDays />, label: 'Created', value: formatDateTime(u.createdAt) },
                      { icon: <Clock />, label: 'Last updated', value: formatDateTime(u.updatedAt) },
                    ]}
                  />
                ),
              },
              ...(canSeeActivity
                ? [
                    {
                      value: 'activity',
                      label: 'Activity',
                      content: <EntityHistory path={`/users/${u.id}/activity`} />,
                    },
                  ]
                : []),
            ]
          : []
      }
    />
  );
}
