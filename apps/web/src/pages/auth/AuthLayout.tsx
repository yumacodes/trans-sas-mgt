import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { ImageSlider, type Slide } from '@/components/ui/image-slider';
import { BRAND } from '@/lib/brand';

/** Equipment the company supplies, shown one at a time beside the form. */
const EQUIPMENT: Slide[] = [
  { src: '/login/anaesthesia-machine.png', alt: 'Anaesthesia machine with patient monitors', caption: 'Anaesthesia machine' },
  { src: '/login/infant-incubator.png', alt: 'Closed infant incubator', caption: 'Infant incubator' },
  { src: '/login/laboratory-microscope.png', alt: 'Binocular laboratory microscope', caption: 'Laboratory microscope' },
  { src: '/login/self-propelled-wheelchair.png', alt: 'Self-propelled wheelchair', caption: 'Self-propelled wheelchair' },
  { src: '/login/examination-light.png', alt: 'Mobile examination light', caption: 'Examination light' },
];

/**
 * Sign-in, password-reset and recovery pages share this shell: one compact panel centred
 * on the page, with the equipment slider on the left and the form on the right.
 *
 * The form is the only interactive region that matters, so it keeps the reading order,
 * the first focus and the full width on small screens; the slider is decorative support
 * that drops away when there is no room for it.
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

      <main className="relative mx-auto flex min-h-screen w-full max-w-[58rem] items-center justify-center p-4 sm:p-6">
        <div className="grid w-full overflow-hidden rounded-[1.5rem] shadow-[0_35px_70px_-30px_rgb(46_48_148_/_0.3)] ring-1 ring-border lg:min-h-[36rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
          {/* Equipment side */}
          <section aria-label="Equipment we supply" className="relative hidden flex-col gap-6 bg-dark-raised p-8 text-dark-ink lg:flex">
            <img src={BRAND.logoSrc} alt="" className="h-8 w-auto self-start rounded-lg bg-white p-1.5" />
            <ImageSlider
              images={EQUIPMENT}
              interval={4000}
              fit="contain"
              className="min-h-0 flex-1 text-white"
              frameClassName="[&_img]:rounded-2xl [&_img]:bg-white [&_img]:p-6 [&_img]:shadow-[0_24px_48px_-20px_rgba(2,6,23,0.7)]"
            />
            <p className="text-lg font-semibold leading-snug tracking-tight text-white">
              Everything Trans-SAS runs on, in one place.
            </p>
          </section>

          {/* Form side */}
          <section className="flex flex-col justify-center bg-surface px-6 py-9 sm:px-9 sm:py-10">
            <img src={BRAND.logoSrc} alt={BRAND.fullName} className="mb-7 h-8 w-auto self-start lg:hidden" />

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
              {description && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>}
            </div>

            <div className="mt-6">{children}</div>

            <p className="mt-8 flex items-start gap-2 border-t border-border pt-5 text-xs leading-relaxed text-ink-subtle">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              Authorised personnel only. Activity on this system is recorded.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
