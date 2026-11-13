import { useId, useState } from 'react';
import { Link } from 'react-router';
import {
  Banknote,
  Building2,
  ChevronDown,
  ClipboardList,
  FileSignature,
  FileText,
  Gavel,
  Package,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AuditEntryDto } from '@tsm/shared';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/app/States';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

type Tone = 'lavender' | 'blue' | 'green' | 'yellow' | 'grey';

/** How each kind of record looks in the stream, and the page that opens it. */
const KINDS: Record<string, { label: string; icon: LucideIcon; tone: Tone; page?: string }> = {
  proforma: { label: 'Proforma', icon: FileText, tone: 'lavender', page: '/proforma' },
  tender: { label: 'Tender', icon: Gavel, tone: 'lavender', page: '/tender-schedule' },
  acceptance: { label: 'Acceptance', icon: FileSignature, tone: 'lavender', page: '/acceptance-letters' },
  sale: { label: 'Sale', icon: ShoppingCart, tone: 'green', page: '/sales' },
  payment: { label: 'Payment', icon: Banknote, tone: 'green', page: '/payments' },
  waybill: { label: 'Delivery', icon: Truck, tone: 'blue', page: '/waybills' },
  purchase: { label: 'Purchase', icon: ShoppingBag, tone: 'blue', page: '/purchases' },
  supplier: { label: 'Supplier', icon: ShoppingBag, tone: 'blue', page: '/suppliers' },
  stock_item: { label: 'Stock', icon: Package, tone: 'yellow', page: '/stock-items' },
  stock_movement: { label: 'Stock', icon: Package, tone: 'yellow', page: '/stock' },
  expense: { label: 'Expense', icon: Wallet, tone: 'yellow' },
  client: { label: 'Client', icon: Users, tone: 'blue', page: '/clients' },
  branch: { label: 'Branch', icon: Building2, tone: 'grey' },
  user: { label: 'User', icon: UserCog, tone: 'grey' },
};
const FALLBACK = { label: 'Update', icon: ClipboardList, tone: 'grey' as Tone };

const TONES: Record<Tone, string> = {
  lavender: 'bg-[#ece9fb] text-[#4b3fb0]',
  blue: 'bg-info-soft text-info',
  green: 'bg-success-soft text-success',
  yellow: 'bg-warning-soft text-warning',
  grey: 'bg-surface-muted text-ink-muted',
};

function Row({ entry, now, open, onToggle }: { entry: AuditEntryDto; now: number; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  const kind = KINDS[entry.entityType] ?? FALLBACK;
  const Icon = kind.icon;
  const link = 'page' in kind && kind.page && entry.entityId ? `${kind.page}?open=${entry.entityId}` : null;
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface-muted"
      >
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl', TONES[kind.tone])} aria-hidden>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{entry.summary}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
            <span className="rounded-full bg-surface-muted px-2 py-px font-semibold text-ink-muted">{kind.label}</span>
            <time dateTime={entry.createdAt}>{formatRelative(entry.createdAt, now)}</time>
          </span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-subtle transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      <div id={panelId} hidden={!open} className="px-3 pb-4 pl-[4.5rem]">
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <Detail label="Action" value={entry.action} />
          <Detail label="Performed by" value={entry.actor?.fullName ?? 'System'} />
          <Detail label="Date and time" value={new Date(entry.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />
        </dl>
        {link && (
          <Link to={link} className="mt-3 inline-flex rounded-full bg-dark px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-dark-raised">
            Open {kind.label.toLowerCase()}
          </Link>
        )}
      </div>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export function ActivityStream({ entries, now }: { entries: AuditEntryDto[] | null; now: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Activity stream</h2>
      <p className="mt-0.5 text-sm text-ink-muted">The latest changes recorded across the company</p>
      {entries === null ? (
        <EmptyState title="Not available" description="Recent activity is shown to people who can read the audit log." />
      ) : entries.length === 0 ? (
        <EmptyState title="No activity yet" description="Changes to records will appear here." />
      ) : (
        <ul className="mt-3">
          {entries.map((e) => (
            <Row key={e.id} entry={e} now={now} open={openId === e.id} onToggle={() => setOpenId((cur) => (cur === e.id ? null : e.id))} />
          ))}
        </ul>
      )}
    </Card>
  );
}
