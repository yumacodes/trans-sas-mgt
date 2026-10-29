import { Suspense, useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { PageLoader } from '@/components/app/FullScreenLoader';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const closeNav = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeNav} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar onOpenNav={() => setMobileOpen(true)} />
        <main id="main" className="w-full flex-1 animate-rise px-5 py-7 sm:px-8 lg:px-12">
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
