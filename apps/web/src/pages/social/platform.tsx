import type { SVGProps } from 'react';
import { Facebook, Instagram, Linkedin, Youtube } from 'lucide-react';
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from '@tsm/shared';
import { cn } from '@/lib/utils';

function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M16.6 3c.4 2.1 1.7 3.6 3.9 3.9v3.1a7.5 7.5 0 0 1-3.9-1.2v6.3A5.9 5.9 0 1 1 10.7 9v3.2a2.8 2.8 0 1 0 2.8 2.8V3h3.1Z" />
    </svg>
  );
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.1 14.43Z" />
    </svg>
  );
}

const ICONS = { instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin, tiktok: TikTokIcon, x: XIcon };

/** Brand colours, used for the platform tile and each account's line on the charts. */
export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  instagram: '#c13584',
  facebook: '#1877f2',
  youtube: '#e62117',
  tiktok: '#111114',
  x: '#3d3d46',
  linkedin: '#0a66c2',
};

export function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const Icon = ICONS[platform];
  return (
    <span
      title={SOCIAL_PLATFORM_LABELS[platform]}
      className={cn('grid size-8 shrink-0 place-items-center rounded-xl text-white', className)}
      style={{ backgroundColor: PLATFORM_COLORS[platform] }}
    >
      <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      <span className="sr-only">{SOCIAL_PLATFORM_LABELS[platform]}</span>
    </span>
  );
}

/** 1234 → "1,234"; 12_400 → "12.4K"; 1_250_000 → "1.25M". Null shows a dash. */
export function compact(value: number | null | undefined) {
  if (value == null) return '—';
  if (Math.abs(value) < 10_000) return value.toLocaleString('en-GB');
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

/** +120, −35, 0, or a dash when there's nothing to compare with. */
export function Change({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return <span className={cn('text-ink-subtle', className)}>—</span>;
  const tone = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-ink-subtle';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <span className={cn('tabular', tone, className)}>
      {sign}
      {compact(Math.abs(value))}
    </span>
  );
}
