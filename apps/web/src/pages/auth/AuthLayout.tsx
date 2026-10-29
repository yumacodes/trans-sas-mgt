import type { ReactNode } from 'react';
import { Boxes, FileText, Lock, ShieldCheck, Wallet } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { EquipmentShowcase } from './EquipmentShowcase';

const HIGHLIGHTS = [
  { icon: FileText, text: 'Proformas, sales, waybills and acceptance letters' },
  { icon: Boxes, text: 'Stock across every branch, with a full movement history' },
  { icon: Wallet, text: 'Payments, expenses and tenders kept traceable' },
  { icon: ShieldCheck, text: 'Role-based access with an audit trail' },
] as const;

/**
 * Sign-in, password-reset and recovery pages share this shell: one console panel
 * centred on a white page, with the brand side on the left and the form on the
 * right.
 *
 * The form is the only interactive region, so it keeps the reading order, the first
 * focus and the full width on small screens; the brand side is decorative support that
 * drops away when there is no room for it.
 */
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
    <div className="relative min-h-screen overflow-x-hidden bg-white">
      {/* Soft colour fields behind the panel; decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-48 size-[42rem] rounded-full bg-accent/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-56 -left-40 size-[38rem] rounded-full bg-highlight/25 blur-3xl"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center p-4 sm:p-6 2xl:max-w-[88rem]">
        <div className="grid w-full overflow-hidden rounded-[1.75rem] shadow-[0_35px_70px_-30px_rgb(46_48_148_/_0.3)] ring-1 ring-border lg:grid-cols-[minmax(0,1.1fr)_minmax(0,27rem)] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,30rem)]">
          {/* Brand side */}
          <section className="relative hidden flex-col justify-between gap-12 bg-dark-raised p-11 text-dark-ink lg:flex xl:p-14">
            <img
              src={BRAND.logoSrc}
              alt=""
              className="h-9 w-auto self-start rounded-lg bg-white p-1.5"
            />

            <div className="max-w-md">
              <p className="eyebrow !text-highlight">Business management</p>
              <h2 className="mt-3 text-[2.1rem] font-semibold leading-[1.12] tracking-tight text-white xl:text-[2.5rem]">
                Everything Trans-SAS runs on, in one place.
              </h2>
              <ul className="mt-7 space-y-3">
                {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                  <li
                    key={text}
                    className="flex items-start gap-3 text-sm leading-snug text-dark-ink/90"
                  >
                    <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <Icon className="size-3.5 text-highlight" aria-hidden />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <EquipmentShowcase className="w-full" />
          </section>

          {/* Form side */}
          <section className="flex flex-col justify-center bg-surface px-6 py-10 sm:px-11 sm:py-14">
            <img src={BRAND.logoSrc} alt={BRAND.fullName} className="mb-8 h-9 w-auto lg:hidden" />

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
              {description && (
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
              )}
            </div>

            <div className="mt-7">{children}</div>

            <p className="mt-9 flex items-start gap-2 border-t border-border pt-5 text-xs leading-relaxed text-ink-subtle">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              Authorised personnel only. Activity on this system is recorded.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
