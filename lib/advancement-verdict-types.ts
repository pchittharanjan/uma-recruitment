export const ADVANCEMENT_VERDICT_VALUES = [
  'green',
  'high_yellow',
  'yellow',
  'low_yellow',
  'red',
] as const;

export type AdvancementVerdict = (typeof ADVANCEMENT_VERDICT_VALUES)[number];

const LEGACY_VERDICT_MAP: Record<string, AdvancementVerdict> = {
  yes: 'green',
  maybe: 'yellow',
  no: 'red',
};

export function isAdvancementVerdict(value: string | null | undefined): value is AdvancementVerdict {
  if (!value) return false;
  return (ADVANCEMENT_VERDICT_VALUES as readonly string[]).includes(value);
}

export function normalizeAdvancementVerdict(
  raw: string | null | undefined,
): AdvancementVerdict | null {
  if (!raw) return null;
  if (isAdvancementVerdict(raw)) return raw;
  return LEGACY_VERDICT_MAP[raw] ?? null;
}

export function verdictLabel(verdict: AdvancementVerdict): string {
  switch (verdict) {
    case 'green':
      return 'Green';
    case 'high_yellow':
      return 'High Yellow';
    case 'yellow':
      return 'Yellow';
    case 'low_yellow':
      return 'Low Yellow';
    case 'red':
      return 'Red';
  }
}

/** Verdicts treated as strong advance signals for panel summaries. */
export function isStrongAdvanceSignal(verdict: AdvancementVerdict | null): boolean {
  return verdict === 'green' || verdict === 'high_yellow';
}
