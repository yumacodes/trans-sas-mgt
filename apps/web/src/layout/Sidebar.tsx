import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { BRAND } from '@/lib/brand';
import { useResetRequests } from '@/lib/queries';
import { cn, safeStorage } from '@/lib/utils';
import { filterNav, NAV, NAV_GROUPS, type NavGroup, type NavItem } from './nav';

const STORAGE_KEY = 'tsm.nav.expanded';

function loadExpanded(): Set<string> {
  try {
    const raw = safeStorage.get(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function containsPath(item: NavItem, path: string): boolean {
  if (item.to && (item.to === '/' ? path === '/' : path.startsWith(item.to))) return true;
  return item.children?.some((c) => containsPath(c, path)) ?? false;
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { canAny, me } = useAuth();
  const location = useLocation();
  const items = useMemo(() => filterNav(NAV, canAny), [canAny]);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);

  // Make sure the section containing the current page is open.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      const walk = (list: NavItem[]) => {
        for (const item of list) {
          if (item.children && containsPath(item, location.pathname) && !next.has(item.id)) {
            next.add(item.id);
            changed = true;
          }
          if (item.children) walk(item.children);
        }
      };
      walk(items);
      return changed ? next : prev;
    });
  }, [location.pathname, items]);

  useEffect(() => {
    safeStorage.set(STORAGE_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  // Close the drawer after navigating on small screens.
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const company = me?.company;
  const sections: { group: NavGroup | null; items: NavItem[] }[] = [
    { group: null, items: items.filter((i) => !i.group) },
    ...NAV_GROUPS.map((group) => ({ group, items: items.filter((i) => i.group === group) })),
  ].filter((s) => s.items.length > 0);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-dark/50 backdrop-blur-[2px] lg:hidden animate-fade-in"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-overlay' : '-translate-x-[110%]',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-24 shrink-0 items-center gap-2 border-b border-border px-5">
          <Link to="/" className="block min-w-0 flex-1 rounded-lg" aria-label={`${company?.name ?? BRAND.fullName} home`}>
            <img
              src={company?.logoUrl ?? BRAND.logoSrc}
              alt={company?.name ?? BRAND.fullName}
              className="h-7 w-auto max-w-full object-contain object-left"
            />
          </Link>
          <button
            type="button"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-muted lg:hidden"
            onClick={onMobileClose}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="scrollbar-slim mt-4 flex-1 overflow-y-auto px-3 pb-3">
          {sections.map(({ group, items: groupItems }) => (
            <NavSection key={group ?? 'top'} group={group}>
              {groupItems.map((item) => (
                <NavEntry
                  key={item.id}
                  item={item}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  pathname={location.pathname}
                />
              ))}
            </NavSection>
          ))}
        </nav>

      </aside>
    </>
  );
}

function NavSection({ group, children }: { group: NavGroup | null; children: ReactNode }) {
  if (!group) {
    return <ul className="mt-3 space-y-0.5">{children}</ul>;
  }
  const id = `nav-group-${group.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="mt-3 first:mt-1">
      <h2 id={id} className="eyebrow px-3 pb-1.5 pt-1">
        {group}
      </h2>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

interface NavEntryProps {
  item: NavItem;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  pathname: string;
}

function PlannedBadge() {
  return (
    <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
      Soon
    </span>
  );
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-none text-white">
      {count > 99 ? '99+' : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function NavEntry({ item, depth, expanded, onToggle, pathname }: NavEntryProps) {
  const Icon = item.icon;
  const resetCount = useResetRequests().data?.length ?? 0;
  const pending = item.showsResetRequests ? resetCount : 0;
  const parentPending = item.children?.some((c) => c.showsResetRequests) ? resetCount : 0;
  const indent = depth === 0 ? 'pl-3' : depth === 1 ? 'pl-10' : 'pl-14';
  const base = cn(
    'flex w-full items-center gap-3 rounded-xl pr-3 text-[13.5px] transition-colors',
    depth === 0 ? 'h-10 lg:h-9' : 'h-9 lg:h-8',
    indent,
  );

  if (item.children) {
    const open = expanded.has(item.id);
    const active = containsPath(item, pathname);
    const panelId = `nav-${item.id}`;
    return (
      <li>
        <button
          type="button"
          className={cn(
            base,
            'text-ink-muted hover:bg-surface-muted hover:text-ink',
            active && 'font-semibold text-ink',
          )}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(item.id)}
        >
          {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
          <span className="truncate">{item.label}</span>
          {!open && <CountBadge count={parentPending} label="password reset requests" />}
          <ChevronRight
            className={cn(parentPending > 0 && !open ? 'ml-1' : 'ml-auto', 'size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        </button>
        {open && (
          <ul id={panelId} className="mt-0.5 space-y-0.5">
            {item.children.map((child) => (
              <NavEntry
                key={child.id}
                item={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                pathname={pathname}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (item.planned || !item.to) {
    return (
      <li>
        <div
          className={cn(base, 'cursor-default text-ink-subtle/70')}
          aria-disabled="true"
          title="This module is planned for a later phase"
        >
          {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
          <span className="truncate" title={item.label}>
            {item.label}
          </span>
          <PlannedBadge />
          <span className="sr-only">(not yet available)</span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          cn(
            base,
            isActive
              ? depth === 0
                ? 'bg-dark font-medium text-white shadow-card'
                : 'bg-accent-soft font-semibold text-accent'
              : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
          )
        }
      >
        {Icon && <Icon className="size-[18px] shrink-0" aria-hidden />}
        <span className="truncate">{item.label}</span>
        <CountBadge count={pending} label="password reset requests" />
      </NavLink>
    </li>
  );
}
