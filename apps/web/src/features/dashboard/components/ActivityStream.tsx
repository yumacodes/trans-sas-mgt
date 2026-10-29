import { useId, useState } from 'react';
import { Link } from 'react-router';
import {
  Banknote,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Package,
  Sparkles,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import type { ActivityIcon, ActivityItem, ActivityTone } from '../data/dashboardMockData';

const ICONS: Record<ActivityIcon, LucideIcon> = {
  proforma: FileText,
  payment: Banknote,
  stock: Package,
  waybill: Truck,
  import: FileSpreadsheet,
  demo: Sparkles,
};

const TONES: Record<ActivityTone, string> = {
  lavender: 'bg-[#ece9fb] text-[#4b3fb0]',
  blue: 'bg-info-soft text-info',
  green: 'bg-success-soft text-success',
  yellow: 'bg-warning-soft text-warning',
};

function Row({ item, now, open, onToggle }: { item: ActivityItem; now: number; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  const Icon = ICONS[item.icon];
  const at = new Date(now - item.minutesAgo * 60_000);
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface-muted"
      >
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl', TONES[item.tone])} aria-hidden>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{item.text}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
            <span className="rounded-full bg-surface-muted px-2 py-px font-semibold text-ink-muted">{item.category}</span>
            <time dateTime={at.toISOString()}>{formatRelative(at.toISOString(), now)}</time>
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-subtle transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div id={panelId} hidden={!open} className="px-3 pb-4 pl-[4.5rem]">
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <Detail label="Reference" value={item.reference} />
          <Detail label="Related record" value={item.related} />
          <Detail label="Performed by" value={item.by} />
          <Detail label="Date and time" value={at.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />
        </dl>
        {item.to ? (
          <Link
            to={item.to}
            className="mt-3 inline-flex rounded-full bg-dark px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-dark-raised"
          >
            {item.toLabel ?? 'Open'}
          </Link>
        ) : (
          <p className="mt-3 text-xs text-ink-subtle">This module isn’t available yet.</p>
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

export function ActivityStream({ items, now }: { items: ActivityItem[]; now: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Activity stream</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Recent business activity · sample entries</p>
      <ul className="mt-3">
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            now={now}
            open={openId === item.id}
            onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
          />
        ))}
      </ul>
    </Card>
  );
}
