import type { ReactNode } from 'react';
import { Boxes, FileText, ShieldCheck, Wallet } from 'lucide-react';
import { BRAND } from '@/lib/brand';

const HIGHLIGHTS = [
  { icon: FileText, text: 'Proformas, sales, waybills and acceptance letters' },
  { icon: Boxes, text: 'Stock across every branch, with a full movement history' },
  { icon: Wallet, text: 'Payments, expenses and tenders kept traceable' },
  { icon: ShieldCheck, text: 'Role-based access with an audit trail' },
] as const;

/** Two-panel layout for sign-in and password pages. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden rounded-3xl bg-dark p-10 text-dark-ink lg:flex">
        {/* Soft colour fields echoing the app canvas; decorative only. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-28 -top-28 size-[28rem] rounded-full bg-[#4a4ad8]/35 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-36 -left-24 size-[26rem] rounded-full bg-accent/70 blur-3xl"
        />

        <div className="relative">
          <span className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-overlay">
            <img src={BRAND.logoSrc} alt={BRAND.fullName} className="h-10 w-auto" />
          </span>
        </div>

        <div className="relative max-w-md">
          <p className="eyebrow !text-highlight">Business management</p>
          <h2 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-white">
            Everything Trans-SAS runs on, in one place.
          </h2>
          <ul className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-dark-ink/90">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon className="size-4 text-highlight" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-dark-ink/60">
          Authorised personnel only. Activity is recorded.
        </p>
      </aside>

      <div className="flex items-center justify-center px-2 py-10">
        <div className="w-full max-w-md rounded-3xl border border-white/80 bg-surface p-8 shadow-raised sm:p-10">
          <img
            src={BRAND.logoSrc}
            alt={BRAND.fullName}
            className="mb-7 h-10 w-auto lg:hidden"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
