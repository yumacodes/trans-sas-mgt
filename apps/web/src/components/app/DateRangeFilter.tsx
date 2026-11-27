import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { todayIso } from '@/lib/format';

/*
 * A period picker for filter bars: a preset dropdown plus labelled From / To date inputs.
 * Dates are local calendar dates as "YYYY-MM-DD", worked out with local-date arithmetic so a
 * user east or west of UTC never gets yesterday's or tomorrow's date.
 */

export const DATE_PRESETS = [
  'any',
  'today',
  'this-week',
  'this-month',
  'last-month',
  'this-quarter',
  'last-quarter',
  'year-to-date',
  'last-12-months',
  'custom',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  any: 'Any time',
  today: 'Today',
  'this-week': 'This week',
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-quarter': 'This quarter',
  'last-quarter': 'Last quarter',
  'year-to-date': 'Year to date',
  'last-12-months': 'Last 12 months',
  custom: 'Custom',
};

/** The presets list pages get by default. */
export const LIST_DATE_PRESETS: DatePreset[] = [
  'any',
  'today',
  'this-week',
  'this-month',
  'last-month',
  'this-quarter',
  'year-to-date',
  'last-12-months',
  'custom',
];

/** A local Date as "YYYY-MM-DD". */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" as a local Date at midnight. */
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * The dates a preset stands for, relative to `today` ("YYYY-MM-DD", local). Calendar periods
 * (week, month, quarter) cover the whole period so a shared link means the same all month;
 * "Year to date" and "Last 12 months" end today. Weeks start on Monday. "Last 12 months" is
 * the current month and the eleven before it. "any" and "custom" have no dates of their own.
 */
export function presetRange(preset: DatePreset, today: string = todayIso()): { from: string; to: string } | null {
  const t = parseIso(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const q = m - (m % 3);
  const span = (from: Date, to: Date) => ({ from: localIso(from), to: localIso(to) });
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'this-week': {
      const offset = (t.getDay() + 6) % 7; // days since Monday
      const start = new Date(y, m, t.getDate() - offset);
      return span(start, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
    }
    case 'this-month':
      return span(new Date(y, m, 1), new Date(y, m + 1, 0));
    case 'last-month':
      return span(new Date(y, m - 1, 1), new Date(y, m, 0));
    case 'this-quarter':
      return span(new Date(y, q, 1), new Date(y, q + 3, 0));
    case 'last-quarter':
      return span(new Date(y, q - 3, 1), new Date(y, q, 0));
    case 'year-to-date':
      return { from: `${y}-01-01`, to: today };
    case 'last-12-months':
      return { from: localIso(new Date(y, m - 11, 1)), to: today };
    default:
      return null;
  }
}

/** Which of `presets` the dates match, "any" when there are none, otherwise "custom". */
export function matchPreset(from: string | undefined, to: string | undefined, presets: readonly DatePreset[] = DATE_PRESETS, today = todayIso()): DatePreset {
  if (!from && !to) return presets.includes('any') ? 'any' : 'custom';
  for (const p of presets) {
    const r = presetRange(p, today);
    if (r && r.from === from && r.to === to) return p;
  }
  return 'custom';
}

export function DateRangeFilter({
  from,
  to,
  onChange,
  presets = LIST_DATE_PRESETS,
  label = 'Period',
}: {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  /** Presets to offer, in order. Defaults to the list-page set. */
  presets?: readonly DatePreset[];
  /** Accessible name of the preset dropdown. */
  label?: string;
}) {
  // Choosing "Custom" keeps it selected even while the dates still match a preset.
  const [custom, setCustom] = useState(false);
  const matched = matchPreset(from, to, presets);
  const selected: DatePreset = custom && presets.includes('custom') ? 'custom' : matched;

  const pick = (value: string) => {
    const preset = value as DatePreset;
    if (preset === 'custom') {
      setCustom(true);
      return;
    }
    setCustom(false);
    if (preset === 'any') onChange(undefined, undefined);
    else {
      const r = presetRange(preset);
      if (r) onChange(r.from, r.to);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <NativeSelect
        aria-label={label}
        value={selected}
        onChange={(e) => pick(e.target.value)}
        className="h-10 w-auto min-w-[150px] rounded-full border-transparent bg-surface-muted pl-4 shadow-none hover:bg-border/60"
      >
        {presets.map((p) => (
          <option key={p} value={p}>
            {p === 'any' ? `${label}: ${DATE_PRESET_LABELS.any}` : DATE_PRESET_LABELS[p]}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        From
        <Input
          type="date"
          aria-label="From date"
          className="h-10 w-auto"
          value={from ?? ''}
          max={to || undefined}
          onChange={(e) => {
            setCustom(true);
            onChange(e.target.value || undefined, to);
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        To
        <Input
          type="date"
          aria-label="To date"
          className="h-10 w-auto"
          value={to ?? ''}
          min={from || undefined}
          onChange={(e) => {
            setCustom(true);
            onChange(from, e.target.value || undefined);
          }}
        />
      </label>
    </div>
  );
}
