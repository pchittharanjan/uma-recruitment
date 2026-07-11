import type {
  DeliberationsCandidate,
  DeliberationsColumnId,
} from '@/lib/deliberations-types';
import { DELIBERATIONS_COLUMN_IDS } from '@/lib/deliberations-types';

/** Which phase average drives board sort. */
export type DeliberationsSortMetric =
  | 'application'
  | 'first'
  | 'final'
  | 'everything';

export type DeliberationsSortDirection = 'desc' | 'asc';

export const DELIBERATIONS_SORT_METRICS: {
  value: DeliberationsSortMetric;
  label: string;
}[] = [
  { value: 'application', label: 'Application' },
  { value: 'first', label: 'First' },
  { value: 'final', label: 'Final' },
  { value: 'everything', label: 'Everything' },
];

/** Mean of whichever phase averages are present; null if none. */
export function overallDeliberationsScore(
  candidate: DeliberationsCandidate,
): number | null {
  const values: number[] = [];
  for (const value of [
    candidate.applicationScore,
    candidate.firstRoundAverage,
    candidate.finalRoundAverage,
  ]) {
    if (value != null && Number.isFinite(value)) values.push(value);
  }
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function scoreForSortMetric(
  candidate: DeliberationsCandidate,
  metric: DeliberationsSortMetric,
): number | null {
  switch (metric) {
    case 'application':
      return candidate.applicationScore;
    case 'first':
      return candidate.firstRoundAverage;
    case 'final':
      return candidate.finalRoundAverage;
    case 'everything':
      return overallDeliberationsScore(candidate);
  }
}

/**
 * Compare two candidates by the active metric.
 * Null / non-finite scores always sort last (both desc and asc).
 */
export function compareCandidatesByScore(
  a: DeliberationsCandidate,
  b: DeliberationsCandidate,
  metric: DeliberationsSortMetric,
  direction: DeliberationsSortDirection,
): number {
  const aScore = scoreForSortMetric(a, metric);
  const bScore = scoreForSortMetric(b, metric);
  const aNull = aScore == null || !Number.isFinite(aScore);
  const bNull = bScore == null || !Number.isFinite(bScore);

  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  const diff =
    direction === 'desc' ? bScore - aScore : aScore - bScore;
  if (diff !== 0) return diff;

  // Stable-ish tiebreak: row index, then name.
  if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
  return a.name.localeCompare(b.name);
}

export function sortCandidatesByScore(
  items: DeliberationsCandidate[],
  metric: DeliberationsSortMetric,
  direction: DeliberationsSortDirection,
): DeliberationsCandidate[] {
  return [...items].sort((a, b) =>
    compareCandidatesByScore(a, b, metric, direction),
  );
}

/** Reorder cards within each column; never moves cards across columns. */
export function sortColumnsByScore(
  columns: Record<DeliberationsColumnId, DeliberationsCandidate[]>,
  metric: DeliberationsSortMetric,
  direction: DeliberationsSortDirection,
): Record<DeliberationsColumnId, DeliberationsCandidate[]> {
  const next = { ...columns };
  for (const columnId of DELIBERATIONS_COLUMN_IDS) {
    next[columnId] = sortCandidatesByScore(
      next[columnId] ?? [],
      metric,
      direction,
    );
  }
  return next;
}
