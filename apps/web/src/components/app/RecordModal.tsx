import type { ReactNode } from 'react';
import { Copy, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { RowAction } from './DataTable';
import { SectionLoader } from './FullScreenLoader';
import { ErrorState } from './States';

export interface RecordTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface RecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  /** Business reference that can be copied (code, SKU, registration number). */
  reference?: string;
  tabs: RecordTab[];
  actions?: ReactNode;
  /** Secondary actions, shown in a "…" menu beside the close button. */
  menu?: RowAction[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Centered record detail panel (full-height sheet on small screens) with tabbed sections. */
export function RecordModal({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  reference,
  tabs,
  actions,
  menu,
  loading,
  error,
  onRetry,
}: RecordModalProps) {
  const copyReference = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(`Copied ${reference}`);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const visibleMenu = (menu ?? []).filter((m) => !m.hidden);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        {visibleMenu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute right-[3.25rem] top-4 z-10 rounded-full bg-surface-muted p-2 text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                aria-label="More actions"
                title="More actions"
              >
                <MoreHorizontal className="size-4" aria-hidden />
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
        <DialogHeader className={visibleMenu.length > 0 ? 'pr-24' : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {status}
          </div>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {subtitle}
              {reference && (
                <button
                  type="button"
                  onClick={() => void copyReference()}
                  className="inline-flex items-center gap-1 rounded px-1 font-mono text-xs text-ink-muted hover:bg-surface-muted hover:text-ink"
                  aria-label={`Copy reference ${reference}`}
                >
                  {reference} <Copy className="size-3" aria-hidden />
                </button>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-[240px]">
          {loading ? (
            <SectionLoader />
          ) : error ? (
            <ErrorState message={error} onRetry={onRetry} />
          ) : tabs.length === 1 ? (
            tabs[0]?.content
          ) : (
            <Tabs defaultValue={tabs[0]?.value}>
              <TabsList>
                {tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((t) => (
                <TabsContent key={t.value} value={t.value}>
                  {t.content}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </DialogBody>
        {actions && !loading && !error && (
          <DialogFooter>
            {actions}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Definition list used inside record overviews. */
export function DetailList({
  items,
}: {
  items: { label: string; value: ReactNode; wide?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl bg-surface-muted/60 p-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={item.wide ? 'sm:col-span-2' : undefined}>
          <dt className="eyebrow">{item.label}</dt>
          <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">
            {item.value === null || item.value === undefined || item.value === '' ? '—' : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
