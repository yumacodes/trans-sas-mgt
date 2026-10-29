import { useEffect, useState, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { GripVertical, Maximize2, MoreHorizontal, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, initials } from '@/lib/utils';
import { SectionLoader } from './FullScreenLoader';
import { ErrorState } from './States';
import type { RowAction } from './DataTable';

export interface ProfileTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Small heading in the top-left, e.g. "Client overview". */
  label: string;
  name: string;
  subtitle?: ReactNode;
  /** Small coloured dot on the avatar, e.g. active / inactive. */
  presence?: 'active' | 'inactive';
  primary?: { label: string; icon: ReactNode; href?: string; onClick?: () => void };
  /** Icon-only buttons beside the primary action. */
  quickActions?: { label: string; icon: ReactNode; onClick: () => void }[];
  /** Entries of the "…" menu. */
  menu?: RowAction[];
  tabs: ProfileTab[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Height-collapsing wrapper: animates between `0fr` and `1fr` so content grows without a jump. */
function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Avatar({ name, presence, large }: { name: string; presence?: 'active' | 'inactive'; large?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ring-4 ring-surface-muted transition-[width,height,font-size] duration-300',
          large ? 'size-24 text-3xl' : 'size-14 text-lg',
        )}
      >
        {initials(name) || '·'}
      </span>
      {presence && (
        <span
          className={cn(
            'absolute bottom-0.5 right-0.5 size-4 rounded-full border-2 border-surface',
            presence === 'active' ? 'bg-success' : 'bg-ink-subtle',
          )}
        >
          <span className="sr-only">{presence === 'active' ? 'Active' : 'Inactive'}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Compact profile card for a person or organisation. The expand button grows it into a
 * full panel with tabbed details; both states share one header and action row.
 */
export function ProfileModal({
  open,
  onOpenChange,
  label,
  name,
  subtitle,
  presence,
  primary,
  quickActions,
  menu,
  tabs,
  loading,
  error,
  onRetry,
}: ProfileModalProps) {
  const [expanded, setExpanded] = useState(false);
  // Every record opens compact, however the previous one was left.
  useEffect(() => {
    if (open) setExpanded(false);
  }, [open]);

  const visibleMenu = (menu ?? []).filter((m) => !m.hidden);
  const ready = !loading && !error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={cn(
          // Bottom sheet on phones; the base dialog keeps it centred from `sm` upwards.
          'inset-x-0 bottom-0 top-auto h-auto max-h-[92vh] overflow-hidden rounded-t-3xl border-0',
          'sm:max-w-[30rem]',
        )}
      >
        <div className="flex items-center gap-2 px-6 pt-5 text-ink-muted">
          <GripVertical className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          <DialogTitle className="text-sm font-medium text-ink-muted">{label}</DialogTitle>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-pressed={expanded}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              title={expanded ? 'Collapse' : 'Expand'}
              className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <span className="relative block size-[18px]">
                <Maximize2
                  className={cn('absolute inset-0 size-[18px] transition-all duration-300', expanded && 'rotate-90 scale-50 opacity-0')}
                  aria-hidden
                />
                <Minimize2
                  className={cn('absolute inset-0 size-[18px] transition-all duration-300', !expanded && '-rotate-90 scale-50 opacity-0')}
                  aria-hidden
                />
              </span>
            </button>
            <DialogClose
              className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="size-[18px]" aria-hidden />
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="sr-only">Details for {name || 'this record'}</DialogDescription>

        {loading ? (
          <div className="min-h-[200px] px-6 py-6">
            <SectionLoader />
          </div>
        ) : error ? (
          <div className="px-6 py-6">
            <ErrorState message={error} onRetry={onRetry} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Compact identity */}
            <Collapse open={!expanded}>
              <div className="flex items-center gap-4 px-6 pb-5 pt-4">
                <Avatar name={name} presence={presence} />
                <div className="min-w-0">
                  <p className="truncate text-2xl font-medium tracking-tight text-ink">{name}</p>
                  {subtitle && <p className="truncate text-sm text-ink-muted">{subtitle}</p>}
                </div>
              </div>
            </Collapse>
            {/* Expanded identity */}
            <Collapse open={expanded}>
              <div className="flex flex-col items-center px-6 pb-5 pt-3 text-center">
                <Avatar name={name} presence={presence} large />
                <p className="mt-4 text-2xl font-medium tracking-tight text-ink">{name}</p>
                {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
              </div>
            </Collapse>

            <div className="flex items-center gap-2 px-6 pb-6">
              {primary &&
                (primary.href ? (
                  <Button asChild size="lg" className="h-12 flex-1 rounded-2xl text-base">
                    <a href={primary.href}>
                      {primary.icon}
                      {primary.label}
                    </a>
                  </Button>
                ) : (
                  <Button size="lg" className="h-12 flex-1 rounded-2xl text-base" onClick={primary.onClick}>
                    {primary.icon}
                    {primary.label}
                  </Button>
                ))}
              {quickActions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  aria-label={a.label}
                  title={a.label}
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted transition-[background-color,color,transform] hover:bg-accent-soft hover:text-accent active:scale-95 [&_svg]:size-5"
                >
                  {a.icon}
                </button>
              ))}
              {visibleMenu.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="More actions"
                      title="More actions"
                      className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted transition-[background-color,color,transform] hover:bg-accent-soft hover:text-accent active:scale-95"
                    >
                      <MoreHorizontal className="size-5" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {visibleMenu.map((m, i) => (
                      <div key={m.label}>
                        {m.separatorBefore && i > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuItem destructive={m.destructive} onSelect={m.onSelect}>
                          {m.icon}
                          {m.label}
                        </DropdownMenuItem>
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Tabs appear only when expanded */}
            <Collapse open={expanded} className="min-h-0 flex-1">
              <TabsPrimitive.Root defaultValue={tabs[0]?.value} className="flex max-h-[46vh] flex-col">
                <TabsPrimitive.List className="flex shrink-0 border-b border-border px-2">
                  {tabs.map((t) => (
                    <TabsPrimitive.Trigger
                      key={t.value}
                      value={t.value}
                      className="relative flex-1 whitespace-nowrap px-3 py-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink data-[state=active]:text-accent after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:scale-x-0 after:rounded-full after:bg-accent after:transition-transform after:duration-300 data-[state=active]:after:scale-x-100"
                    >
                      {t.label}
                    </TabsPrimitive.Trigger>
                  ))}
                </TabsPrimitive.List>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  {tabs.map((t) => (
                    <TabsPrimitive.Content
                      key={t.value}
                      value={t.value}
                      className="animate-rise focus-visible:outline-none"
                    >
                      {ready && t.content}
                    </TabsPrimitive.Content>
                  ))}
                </div>
              </TabsPrimitive.Root>
            </Collapse>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Icon + label + value rows, as shown in the expanded profile's Info tab. */
export function InfoRows({
  items,
}: {
  items: { icon: ReactNode; label: string; value: ReactNode }[];
}) {
  return (
    <dl className="divide-y divide-border/50">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[8.5rem_1fr] items-start gap-3 py-2.5">
          <dt className="flex items-center gap-2.5 text-sm text-ink-muted [&_svg]:size-[18px] [&_svg]:shrink-0">
            {item.icon}
            {item.label}
          </dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-sm text-ink">
            {item.value === null || item.value === undefined || item.value === '' ? '—' : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
