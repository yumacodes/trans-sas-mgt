import { Link, useLocation, useMatches } from 'react-router';
import { ChevronRight, LogOut, Menu, UserCog } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RangeSelector } from '@/features/dashboard/components/Toolbar';
import { useDashboardRange } from '@/features/dashboard/rangeStore';
import { initials } from '@/lib/utils';

export interface RouteHandle {
  title: string;
  /** Parent section label shown before the title in the breadcrumb. */
  section?: string;
}

export function useRouteTitle(): RouteHandle | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle as RouteHandle | undefined;
    if (handle?.title) return handle;
  }
  return undefined;
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { me, signOut } = useAuth();
  const handle = useRouteTitle();
  const user = me?.user;
  const { pathname } = useLocation();
  const [range, setRange] = useDashboardRange();
  const showRange = pathname === '/' && import.meta.env.VITE_DASHBOARD_DEMO !== 'false';

  return (
    <header className="sticky top-0 z-30 flex h-24 shrink-0 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        className="-ml-2 rounded-full p-2.5 text-ink-muted hover:bg-surface-muted lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 text-sm">
          {handle?.section && (
            <>
              <li className="hidden truncate text-ink-subtle sm:block">{handle.section}</li>
              <li className="hidden text-ink-subtle sm:block" aria-hidden>
                <ChevronRight className="size-3.5" />
              </li>
            </>
          )}
          <li className="truncate font-semibold text-ink" aria-current="page">
            {handle?.title ?? ''}
          </li>
        </ol>
      </nav>

      {showRange && <RangeSelector value={range} onChange={setRange} />}

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-surface-muted"
              aria-label={`Account menu for ${user.fullName}`}
            >
              <Avatar>
                <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[160px] truncate text-sm font-medium text-ink">
                  {user.fullName}
                </span>
                <span className="block max-w-[160px] truncate text-xs text-ink-subtle">
                  {user.roles.map((r) => r.name).join(', ') || 'No role'}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-medium text-ink">{user.fullName}</span>
              <span className="block truncate">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account">
                <UserCog aria-hidden /> Account settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut aria-hidden /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
