import {
  ACCEPTANCE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PURCHASE_STATUS_LABELS,
  type PurchaseStatus,
  SALE_STATUS_LABELS,
  WAYBILL_STATUS_LABELS,
  type PaymentStatus,
  type SaleStatus,
  type WaybillStatus,
  EXPENSE_STATUS_LABELS,
  TENDER_STATUS_LABELS,
  MESSAGE_STATUS_LABELS,
  PROFORMA_STATUS_LABELS,
  type AcceptanceStatus,
  type ClientStatus,
  type TenderStatus,
  type ExpenseStatus,
  type MessageStatus,
  type ProformaStatus,
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

const PROFORMA_TONES: Record<ProformaStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  issued: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
};

export function ProformaStatusBadge({ status }: { status: ProformaStatus }) {
  return (
    <Badge tone={PROFORMA_TONES[status]} dot>
      {PROFORMA_STATUS_LABELS[status]}
    </Badge>
  );
}

const EXPENSE_TONES: Record<ExpenseStatus, BadgeProps['tone']> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  voided: 'neutral',
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <Badge tone={EXPENSE_TONES[status]} dot>
      {EXPENSE_STATUS_LABELS[status]}
    </Badge>
  );
}

const TENDER_TONES: Record<TenderStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  submitted: 'info',
  awarded: 'success',
  not_awarded: 'danger',
  cancelled: 'neutral',
};

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return (
    <Badge tone={TENDER_TONES[status]} dot>
      {TENDER_STATUS_LABELS[status]}
    </Badge>
  );
}

const ACCEPTANCE_TONES: Record<AcceptanceStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  issued: 'success',
  cancelled: 'danger',
};

export function AcceptanceStatusBadge({ status }: { status: AcceptanceStatus }) {
  return (
    <Badge tone={ACCEPTANCE_TONES[status]} dot>
      {ACCEPTANCE_STATUS_LABELS[status]}
    </Badge>
  );
}

const SALE_TONES: Record<SaleStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  confirmed: 'success',
  cancelled: 'danger',
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <Badge tone={SALE_TONES[status]} dot>
      {SALE_STATUS_LABELS[status]}
    </Badge>
  );
}

const WAYBILL_TONES: Record<WaybillStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  dispatched: 'warning',
  delivered: 'success',
  cancelled: 'danger',
};

export function WaybillStatusBadge({ status }: { status: WaybillStatus }) {
  return (
    <Badge tone={WAYBILL_TONES[status]} dot>
      {WAYBILL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={status === 'posted' ? 'success' : 'danger'} dot>
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

const PURCHASE_TONES: Record<PurchaseStatus, BadgeProps['tone']> = {
  draft: 'neutral',
  ordered: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'danger',
};

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return (
    <Badge tone={PURCHASE_TONES[status]} dot>
      {PURCHASE_STATUS_LABELS[status]}
    </Badge>
  );
}
