import * as React from 'react';
import { cn } from '@/lib/utils';

export interface Slide {
  src: string;
  alt: string;
  /** Shown under the image. */
  caption?: string;
}

interface ImageSliderProps extends React.HTMLAttributes<HTMLDivElement> {
  images: Slide[];
  /** Milliseconds each slide stays before the next one. */
  interval?: number;
  /** "contain" shows the whole image (product shots); "cover" fills the frame (photographs). */
  fit?: 'contain' | 'cover';
  /** Classes for the frame each image sits in. */
  frameClassName?: string;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cycles through images, sliding the next one in from the right while the current one
 * leaves to the left. Pauses while hovered or focused, and doesn't advance by itself for
 * people who asked for reduced motion. The dots under it jump to a slide and restart
 * the timer. CSS transitions only, so it adds no animation library to the page.
 */
const ImageSlider = React.forwardRef<HTMLDivElement, ImageSliderProps>(
  ({ images, interval = 5000, fit = 'cover', frameClassName, className, ...props }, ref) => {
    const [current, setCurrent] = React.useState(0);
    const [paused, setPaused] = React.useState(false);
    // Changing it restarts the timer, so a slide picked by hand gets its full time.
    const [cycle, setCycle] = React.useState(0);
    const count = images.length;

    React.useEffect(() => {
      if (paused || count < 2 || reducedMotion()) return;
      const timer = setInterval(() => setCurrent((i) => (i + 1) % count), interval);
      return () => clearInterval(timer);
    }, [paused, count, interval, cycle]);

    const goTo = (index: number) => {
      setCurrent(index);
      setCycle((c) => c + 1);
    };

    return (
      <div
        ref={ref}
        role="region"
        aria-roledescription="carousel"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setPaused(false)}
        className={cn('relative flex h-full w-full flex-col overflow-hidden', className)}
        {...props}
      >
        <div className={cn('relative min-h-0 flex-1 overflow-hidden', frameClassName)}>
          {images.map((image, index) => {
            const offset = (index - current + count) % count;
            const state = offset === 0 ? 'current' : offset === count - 1 ? 'previous' : 'next';
            return (
              <figure
                key={image.src}
                aria-hidden={state !== 'current'}
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}`}
                className={cn(
                  'absolute inset-0 m-0 flex flex-col items-center justify-center transition-[opacity,transform] duration-[800ms] ease-in-out motion-reduce:transition-opacity',
                  state === 'current' && 'translate-x-0 opacity-100',
                  state === 'previous' && '-translate-x-12 opacity-0 motion-reduce:translate-x-0',
                  state === 'next' && 'translate-x-12 opacity-0 motion-reduce:translate-x-0',
                )}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  decoding="async"
                  draggable={false}
                  className={cn('min-h-0 w-full flex-1', fit === 'contain' ? 'object-contain' : 'object-cover')}
                />
                {image.caption && <figcaption className="mt-3 text-sm font-medium">{image.caption}</figcaption>}
              </figure>
            );
          })}
        </div>

        {count > 1 && (
          <div className="mt-5 flex justify-center gap-1">
            {images.map((image, index) => (
              <button
                key={image.src}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Show ${image.caption ?? `slide ${index + 1}`}`}
                aria-current={index === current}
                className="group grid h-6 place-items-center px-1"
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full transition-all duration-300',
                    index === current ? 'w-6 bg-white' : 'w-1.5 bg-white/45 group-hover:bg-white/80',
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);

ImageSlider.displayName = 'ImageSlider';

export { ImageSlider };
