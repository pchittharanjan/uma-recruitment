/** Shared proportional column widths for Ranked applicants (table-fixed + colgroup). */

/**
 * Relative weights — normalized to 100% for whichever columns are active.
 *
 * Recommendation must stay wide enough for the content-sized picker
 * (min-w-[9rem] ≈ 144px + cell px-3×2 + optional 4px accent strip).
 * Applicant must NOT be a flexible sink (that created a middle canyon).
 */
const COL_WEIGHTS = {
  expand: 3,
  recommendation: 18,
  rank: 6,
  applicant: 15,
  view: 12,
  score: 13,
  status: 18,
  advance: 12,
} as const;

type ColKey = keyof typeof COL_WEIGHTS;

/**
 * Normalize active column weights to percentages that always sum to 100%,
 * so the table spans the full card — never rem islands or a single flexible sink.
 */
function widthPercents(keys: ColKey[]): Record<ColKey, string> {
  const total = keys.reduce((sum, key) => sum + COL_WEIGHTS[key], 0);
  const result = {} as Record<ColKey, string>;
  for (const key of keys) {
    result[key] = `${((COL_WEIGHTS[key] / total) * 100).toFixed(2)}%`;
  }
  return result;
}

export function AdvancementRankColGroup({
  expand = false,
  decision = false,
  advance = false,
  view = false,
}: {
  expand?: boolean;
  decision?: boolean;
  advance?: boolean;
  view?: boolean;
}) {
  const keys: ColKey[] = [
    ...(expand ? (['expand'] as const) : []),
    ...(decision ? (['recommendation'] as const) : []),
    'rank',
    'applicant',
    ...(view ? (['view'] as const) : []),
    'score',
    'status',
    ...(advance ? (['advance'] as const) : []),
  ];
  const widths = widthPercents(keys);

  return (
    <colgroup>
      {expand ? <col style={{ width: widths.expand }} /> : null}
      {decision ? <col style={{ width: widths.recommendation }} /> : null}
      <col style={{ width: widths.rank }} />
      <col style={{ width: widths.applicant }} />
      {view ? <col style={{ width: widths.view }} /> : null}
      <col style={{ width: widths.score }} />
      <col style={{ width: widths.status }} />
      {advance ? <col style={{ width: widths.advance }} /> : null}
    </colgroup>
  );
}
