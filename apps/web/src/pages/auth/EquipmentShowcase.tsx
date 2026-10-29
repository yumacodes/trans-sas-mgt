import { cn } from '@/lib/utils';

/**
 * Catalogue shots as a shelf that recedes to the right: uneven tile sizes on one shared
 * perspective, each lifted a different distance towards the viewer. Purely decorative —
 * it follows the copy in the reading order and never moves, so there is no motion to
 * opt out of.
 */
const EQUIPMENT = [
  {
    src: '/login/anaesthesia-machine.png',
    alt: 'Anaesthesia machine with patient monitors',
    area: 'col-span-2 row-span-3 col-start-1 row-start-1',
    lift: 76,
  },
  {
    src: '/login/infant-incubator.png',
    alt: 'Closed infant incubator',
    area: 'col-start-3 row-start-1 row-span-2',
    lift: 46,
  },
  {
    src: '/login/laboratory-microscope.png',
    alt: 'Binocular laboratory microscope',
    area: 'col-start-3 row-start-3',
    lift: 18,
  },
  {
    src: '/login/self-propelled-wheelchair.png',
    alt: 'Self-propelled wheelchair',
    area: 'col-start-4 row-start-1',
    lift: 6,
  },
  {
    src: '/login/examination-light.png',
    alt: 'Mobile examination light',
    area: 'col-start-4 row-start-2 row-span-2',
    lift: 30,
  },
] as const;

export function EquipmentShowcase({ className }: { className?: string }) {
  return (
    <div className={cn('[perspective:1000px]', className)}>
      <div
        className={cn(
          'grid grid-cols-4 gap-3 auto-rows-[3.6rem] xl:auto-rows-[4.3rem] 2xl:auto-rows-[5rem]',
          '[transform-style:preserve-3d] [transform:rotateX(7deg)_rotateY(-15deg)_rotateZ(1deg)]',
        )}
      >
        {EQUIPMENT.map(({ src, alt, area, lift }) => (
          <figure
            key={src}
            style={{ transform: `translateZ(${lift}px)` }}
            className={cn(
              area,
              'overflow-hidden rounded-xl bg-white p-2 ring-1 ring-white/25',
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
