import {
  MESSAGE_STATUS_LABELS,
  type ClientStatus,
  type MessageStatus,
  type RegistrationStatus,
} from '@tsm/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'} dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <Badge tone={status === 'active' ? 'success' : 'neutral'} dot>
      {status === 'active' ? 'Active' : 'Archived'}
    </Badge>
  );
}

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  expired: 'Expired',
  revoked: 'Revoked',
};

const REGISTRATION_TONES: Record<RegistrationStatus, BadgeProps['tone']> = {
  pending: 'info',
  active: 'success',
  suspended: 'warning',
  expired: 'neutral',
  revoked: 'danger',
};

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <Badge tone={REGISTRATION_TONES[status]} dot>
      {REGISTRATION_STATUS_LABELS[status]}
    </Badge>
  );
}

export function LowStockBadge() {
  return (
    <Badge tone="warning" dot>
      Low stock
    </Badge>
  );
}

const MESSAGE_TONES: Record<MessageStatus, BadgeProps['tone']> = {
  queued: 'info',
  sending: 'info',
  sent: 'success',
  partially_sent: 'warning',
  failed: 'danger',
};

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  return (
    <Badge tone={MESSAGE_TONES[status]} dot>
      {MESSAGE_STATUS_LABELS[status]}
    </Badge>
  );
}
