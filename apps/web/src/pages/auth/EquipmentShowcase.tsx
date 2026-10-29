import { cn } from '@/lib/utils';

/**
 * Catalogue shots arranged as a tilted collage beside the sign-in copy: uneven tile
 * sizes on a shared perspective, each lifted a different distance towards the viewer.
 * Decorative, so it sits behind the copy in the reading order and stays still for
 * anyone who asked for reduced motion.
 */
const EQUIPMENT = [
  {
    src: '/login/anaesthesia-machine.png',
    alt: 'Anaesthesia machine with patient monitors',
    area: 'col-span-2 row-span-2 col-start-1 row-start-1',
    lift: 74,
  },
  {
    src: '/login/infant-incubator.png',
    alt: 'Closed infant incubator',
    area: 'col-start-3 row-start-1',
    lift: 16,
  },
  {
    src: '/login/laboratory-microscope.png',
    alt: 'Binocular laboratory microscope',
    area: 'col-start-3 row-start-2',
    lift: 40,
  },
  {
    src: '/login/self-propelled-wheelchair.png',
    alt: 'Self-propelled wheelchair',
    area: 'col-start-1 row-start-3',
    lift: 4,
  },
  {
    src: '/login/examination-light.png',
    alt: 'Mobile examination light',
    area: 'col-span-2 col-start-2 row-start-3',
    lift: 28,
  },
] as const;

export function EquipmentShowcase({ className }: { className?: string }) {
  return (
    <div className={cn('[perspective:820px]', className)}>
      <div
        className={cn(
          'grid grid-cols-3 gap-3 auto-rows-[4rem] xl:auto-rows-[5rem] 2xl:auto-rows-[6rem]',
          '[transform-style:preserve-3d] [transform:rotateX(10deg)_rotateY(-21deg)_rotateZ(1.5deg)]',
        )}
      >
        {EQUIPMENT.map(({ src, alt, area, lift }) => (
          <figure
            key={src}
            style={{ transform: `translateZ(${lift}px)` }}
            className={cn(
              area,
              'overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-white/25',
              'shadow-[0_26px_50px_-20px_rgba(2,6,23,0.95)]',
            )}
          >
            <img
              src={src}
              alt={alt}
              className="size-full object-contain"
              decoding="async"
              draggable={false}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
