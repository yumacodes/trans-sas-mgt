import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  Copy,
  GitBranch,
  Hash,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Tag,
  Truck,
  UserCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { ORGANIZATION_TYPE_LABELS, type ClientDto } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import type { RowAction } from '@/components/app/DataTable';
import { EntityHistory } from '@/components/app/EntityHistory';
import { InfoRows, ProfileModal, type ProfileTab } from '@/components/app/ProfileModal';
import { ClientStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState } from '@/components/app/States';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

interface Props {
  clientId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (client: ClientDto) => void;
  /** Extra entries for the "…" menu, built from the loaded client. */
  menu?: (client: ClientDto) => RowAction[];
}

export function ClientDetailModal({ clientId, onOpenChange, onEdit, menu }: Props) {
  const { can } = useAuth();
  const query = useQuery({
    queryKey: [...qk.clients, 'detail', clientId],
    queryFn: ({ signal }) => api.get<ClientDto>(`/clients/${clientId}`, undefined, signal),
    enabled: Boolean(clientId),
  });
  const c = query.data;

  const tabs: ProfileTab[] = c
    ? [
        {
          value: 'info',
          label: 'Info',
          content: (
            <InfoRows
              items={[
                { icon: <Tag />, label: 'Status', value: <ClientStatusBadge status={c.status} /> },
                { icon: <Phone />, label: 'Phone', value: c.phone },
                {
                  icon: <Mail />,
                  label: 'Email',
                  value: c.email && (
                    <a href={`mailto:${c.email}`} className="text-accent hover:underline">
                      {c.email}
                    </a>
                  ),
                },
                { icon: <Building2 />, label: 'Type', value: ORGANIZATION_TYPE_LABELS[c.organizationType] },
                { icon: <UserRound />, label: 'Contact', value: c.contactPerson },
                { icon: <MapPin />, label: 'Billing address', value: c.billingAddress },
                { icon: <Truck />, label: 'Delivery address', value: c.deliveryAddress },
                { icon: <Hash />, label: 'Tax / reg. ID', value: c.taxId },
                { icon: <GitBranch />, label: 'Branch', value: c.branch ? `${c.branch.code} — ${c.branch.name}` : 'All branches' },
                { icon: <UserCheck />, label: 'Account owner', value: c.accountOwner?.fullName ?? 'Not assigned' },
                { icon: <CalendarDays />, label: 'Created', value: formatDateTime(c.createdAt) },
              ]}
            />
          ),
        },
        {
          value: 'notes',
          label: 'Notes',
          content: c.notes ? (
            <p className="whitespace-pre-line text-sm text-ink">{c.notes}</p>
          ) : (
            <p className="py-6 text-center text-sm text-ink-muted">No notes have been added for this client.</p>
          ),
        },
        {
          value: 'related',
          label: 'Related',
          content: (
            <EmptyState
              className="rounded-2xl border border-dashed border-border py-8"
              title="No linked documents yet"
              description="Proformas, sales, waybills, acceptance letters and payments for this client will be listed here once those modules are available."
            />
          ),
        },
        ...(can('audit.read')
          ? [
              {
                value: 'history',
                label: 'History',
                content: <EntityHistory entityType="client" entityId={c.id} />,
              },
            ]
          : []),
      ]
    : [];

  const copyCode = async () => {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.code);
      toast.success(`Copied ${c.code}`);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const canEdit = Boolean(c && c.status === 'active' && can('clients.update'));

  return (
    <ProfileModal
      open={Boolean(clientId)}
      onOpenChange={onOpenChange}
      label="Client overview"
      name={c?.name ?? ''}
      subtitle={c ? [ORGANIZATION_TYPE_LABELS[c.organizationType], c.code].filter(Boolean).join(' · ') : undefined}
      presence={c ? (c.status === 'active' ? 'active' : 'inactive') : undefined}
      primary={
        c?.email
          ? { label: 'Send email', icon: <Mail />, href: `mailto:${c.email}` }
          : undefined
      }
      quickActions={canEdit && c ? [{ label: 'Edit client', icon: <Pencil />, onClick: () => onEdit(c) }] : []}
      menu={[
        ...(c && menu ? menu(c) : []),
        { label: 'Copy client code', icon: <Copy />, onSelect: () => void copyCode(), separatorBefore: true },
      ]}
      loading={query.isLoading}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      tabs={tabs}
    />
  );
}
