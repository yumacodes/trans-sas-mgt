import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { PageLoader } from '@/components/app/FullScreenLoader';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { warmAllRoutes } from '@/lib/prefetch';
import { filterNav, NAV } from './nav';
import { Sidebar } from './Sidebar';
import { cn, safeStorage } from '@/lib/utils';
import { Topbar } from './Topbar';

const RAIL_KEY = 'tsm.nav.rail';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop sidebar: full width, or a narrow rail showing icons only. Remembered per browser.
  const [rail, setRail] = useState(() => {
    const saved = safeStorage.get(RAIL_KEY);
    // First visit on a smaller laptop screen: start collapsed to leave room for the content.
    return saved === null ? window.innerWidth < 1280 : saved === '1';
  });
  useEffect(() => {
    safeStorage.set(RAIL_KEY, rail ? '1' : '0');
  }, [rail]);
  const location = useLocation();
  const queryClient = useQueryClient();
  const { can, canAny } = useAuth();
  // Once signed in, quietly download every page the user can open, plus its first table
  // page, so clicking a sidebar tab shows it immediately.
  useEffect(() => {
    const paths = filterNav(NAV, canAny).flatMap((i) => [i, ...(i.children ?? [])]).map((i) => i.to).filter((t): t is string => Boolean(t));
    warmAllRoutes(paths, queryClient, can);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const closeNav = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeNav} rail={rail} onExpandRail={() => setRail(false)} />
      <div className={cn('flex min-h-screen min-w-0 flex-col transition-[padding] duration-200', rail ? 'lg:pl-16' : 'lg:pl-56 xl:pl-60')}>
        <Topbar onOpenNav={() => setMobileOpen(true)} rail={rail} onToggleRail={() => setRail((r) => !r)} />
        <main id="main" className="w-full min-w-0 max-w-full flex-1 animate-rise px-4 py-6 sm:px-6 xl:px-10">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
