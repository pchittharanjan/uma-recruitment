'use client';

import { PickerDropdown } from '@/components/picker-dropdown';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  isAdvancementVerdict,
  isStrongAdvanceSignal,
  verdictLabel,
  type AdvancementVerdict,
} from '@/lib/advancement-verdict-types';

export type { AdvancementVerdict };

const VERDICT_OPTIONS: Array<{
  value: AdvancementVerdict;
  indicatorClassName: string;
  activeClass: string;
}> = [
  {
    value: 'green',
    indicatorClassName: 'bg-green-500',
    activeClass:
      'border-green-600 bg-green-500 text-white dark:border-green-500 dark:bg-green-600',
  },
  {
    value: 'high_yellow',
    indicatorClassName: 'bg-yellow-400',
    activeClass:
      'border-yellow-500 bg-yellow-400 text-yellow-950 dark:border-yellow-500 dark:bg-yellow-500',
  },
  {
    value: 'yellow',
    indicatorClassName: 'bg-amber-400',
    activeClass:
      'border-amber-500 bg-amber-400 text-amber-950 dark:border-amber-500 dark:bg-amber-500',
  },
  {
    value: 'low_yellow',
    indicatorClassName: 'bg-orange-400',
    activeClass:
      'border-orange-500 bg-orange-400 text-orange-950 dark:border-orange-500 dark:bg-orange-500',
  },
  {
    value: 'red',
    indicatorClassName: 'bg-red-500',
    activeClass:
      'border-red-600 bg-red-500 text-white dark:border-red-500 dark:bg-red-600',
  },
];

const VERDICT_PICKER_OPTIONS = VERDICT_OPTIONS.map((option) => ({
  value: option.value,
  label: verdictLabel(option.value),
  indicatorClassName: option.indicatorClassName,
}));

/** Hex colors for the left accent strip — match verdict indicator dots. */
export const VERDICT_ACCENT_HEX: Record<AdvancementVerdict, string> = {
  green: '#00c758', // green-500
  high_yellow: '#fac800', // yellow-400
  yellow: '#fbbf24', // amber-400
  low_yellow: '#fb923c', // orange-400
  red: '#fb2c36', // red-500
};

/** Left accent bar via inline backgroundColor (Tailwind bg-* on absolute table-cell children is unreliable). */
export function VerdictAccentBar({
  verdict,
  className,
  colorOverride,
}: {
  verdict: AdvancementVerdict | null;
  className?: string;
  /** Final-list advance selection can force green regardless of verdict. */
  colorOverride?: string | null;
}) {
  const color = colorOverride ?? (verdict ? VERDICT_ACCENT_HEX[verdict] : null);
  if (!color) return null;

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-y-0 left-0 z-10 w-1', className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function verdictRowClass(verdict: AdvancementVerdict | null): string {
  switch (verdict) {
    case 'green':
      return 'bg-green-50/70 dark:bg-green-950/25';
    case 'high_yellow':
      return 'bg-yellow-50/70 dark:bg-yellow-950/20';
    case 'yellow':
      return 'bg-amber-50/60 dark:bg-amber-950/20';
    case 'low_yellow':
      return 'bg-orange-50/50 dark:bg-orange-950/20';
    case 'red':
      return 'bg-red-50/50 dark:bg-red-950/20';
    default:
      return '';
  }
}

export function verdictStatusLabel(verdict: AdvancementVerdict | null): string | null {
  if (!verdict) return null;
  return verdictLabel(verdict);
}

export function panelStrongSignalCount(
  myVerdict: AdvancementVerdict | null,
  panelVerdicts: Array<{ verdict: AdvancementVerdict | null }>,
): number {
  let count = isStrongAdvanceSignal(myVerdict) ? 1 : 0;
  for (const entry of panelVerdicts) {
    if (isStrongAdvanceSignal(entry.verdict)) count++;
  }
  return count;
}

export function panelGreenCount(
  myVerdict: AdvancementVerdict | null,
  panelVerdicts: Array<{ verdict: AdvancementVerdict | null }>,
): number {
  let count = myVerdict === 'green' ? 1 : 0;
  for (const entry of panelVerdicts) {
    if (entry.verdict === 'green') count++;
  }
  return count;
}

export function PanelVerdictSummary({
  panelVerdicts,
  myVerdict,
  className,
}: {
  panelVerdicts: Array<{ name: string; verdict: AdvancementVerdict | null }>;
  /** Include the current user's pick in the aggregate (panelVerdicts excludes them). */
  myVerdict?: AdvancementVerdict | null;
  className?: string;
}) {
  const allSignals = [
    ...(myVerdict ? [{ name: 'You', verdict: myVerdict }] : []),
    ...panelVerdicts.filter(
      (entry): entry is { name: string; verdict: AdvancementVerdict } => Boolean(entry.verdict),
    ),
  ];

  if (allSignals.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5 text-sm', className)}>
      {allSignals.map((entry, index) => {
        const option = VERDICT_OPTIONS.find((o) => o.value === entry.verdict);
        const label = `${entry.name}: ${verdictLabel(entry.verdict)}`;
        return (
          <Tooltip key={`${entry.name}-${entry.verdict}-${index}`}>
            <TooltipTrigger
              type="button"
              aria-label={label}
              className="inline-flex cursor-default items-center justify-center rounded-full"
            >
              <span
                className={cn(
                  'inline-block size-3 rounded-full border',
                  option?.activeClass ?? 'border-border bg-muted',
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

export function verdictStatusClass(verdict: AdvancementVerdict | null): string {
  switch (verdict) {
    case 'green':
      return 'text-green-700 dark:text-green-400';
    case 'high_yellow':
      return 'text-yellow-700 dark:text-yellow-400';
    case 'yellow':
      return 'text-amber-700 dark:text-amber-400';
    case 'low_yellow':
      return 'text-orange-700 dark:text-orange-400';
    case 'red':
      return 'text-red-700 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

export function PanelVerdictDots({
  panelVerdicts,
  myVerdict,
}: {
  panelVerdicts: Array<{ name: string; verdict: AdvancementVerdict | null }>;
  myVerdict?: AdvancementVerdict | null;
}) {
  const all = [
    ...(myVerdict ? [{ name: 'You', verdict: myVerdict }] : []),
    ...panelVerdicts.filter((v) => v.verdict),
  ];
  if (all.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1" aria-label="Panel color signals">
      {all.map((entry, index) => {
        const option = VERDICT_OPTIONS.find((o) => o.value === entry.verdict);
        return (
          <span
            key={`${entry.name}-${index}`}
            title={`${entry.name}: ${entry.verdict ? verdictLabel(entry.verdict) : 'None'}`}
            className={cn(
              'inline-block size-2.5 rounded-full border',
              option?.activeClass ?? 'border-border bg-muted',
            )}
          />
        );
      })}
    </div>
  );
}

export function AdvancementVerdictSelector({
  value,
  onChange,
  disabled = false,
  applicantLabel,
  readOnlyHint,
}: {
  value: AdvancementVerdict | null;
  onChange: (verdict: AdvancementVerdict | null) => void;
  disabled?: boolean;
  applicantLabel: string;
  readOnlyHint?: string;
}) {
  if (readOnlyHint) {
    return (
      <span
        className="text-sm text-muted-foreground"
        title={readOnlyHint}
        aria-label={readOnlyHint}
      >
        -
      </span>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <PickerDropdown
        value={value}
        onChange={onChange}
        options={VERDICT_PICKER_OPTIONS}
        placeholder="Not set"
        allowClear
        clearLabel="Not set"
        disabled={disabled}
        aria-label={`Recommendation for ${applicantLabel}`}
        className="w-max max-w-full min-w-0"
        triggerClassName="min-w-[9rem] w-max max-w-full"
        contentClassName="w-max min-w-[10rem]"
      />
    </div>
  );
}

export function parseClientVerdict(value: unknown): AdvancementVerdict | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' && isAdvancementVerdict(value)) return value;
  return undefined;
}
