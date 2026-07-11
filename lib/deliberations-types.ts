export type DeliberationsColumnId = 'pool' | 'considering' | 'accept';

export const DELIBERATIONS_COLUMN_IDS: DeliberationsColumnId[] = [
  'pool',
  'considering',
  'accept',
];

export interface DeliberationsCandidate {
  id: string;
  applicationId: number;
  rowIndex: number;
  name: string;
  stage: string;
  /** Mean of application-stage field scores (1–5). Not `applications.final_score`. */
  applicationScore: number | null;
  /** Mean of first-round interview field scores (1–5). */
  firstRoundAverage: number | null;
  /** Mean of final-round interview field scores (1–5). */
  finalRoundAverage: number | null;
  /** Rejected / “No” mark for deliberations (persisted with board layout). */
  rejected: boolean;
}

/** Saved kanban positions for a team+round. applicationIds only — scores come from live data. */
export interface DeliberationsBoardLayout {
  columns: Record<DeliberationsColumnId, number[]>;
  rejected: number[];
}

export interface DeliberationsBoardData {
  teamId: number;
  roundId: number;
  acceptLimit: number | null;
  allowOverCap: boolean;
  candidates: DeliberationsCandidate[];
  /** Persisted column/order/rejected state, if the board has been saved. */
  layout: DeliberationsBoardLayout | null;
}

export interface DeliberationsScoreEntry {
  reviewerName: string;
  status: string;
  scores: Record<string, number>;
  average: number | null;
  comment: string | null;
}

export interface DeliberationsFlag {
  color: 'red' | 'green';
  note: string | null;
  authorName: string;
  createdAt: number;
}

export interface DeliberationsCandidateDetail {
  applicationId: number;
  rowIndex: number;
  name: string;
  email: string;
  stage: string;
  adminNote: string | null;
  fields: Record<string, string>;
  phaseAverages: {
    application: number | null;
    firstRound: number | null;
    finalRound: number | null;
  };
  applicationReviews: DeliberationsScoreEntry[];
  firstRoundReviews: DeliberationsScoreEntry[];
  finalRoundReviews: DeliberationsScoreEntry[];
  flags: DeliberationsFlag[];
}

function emptyLayoutColumns(): Record<DeliberationsColumnId, number[]> {
  return { pool: [], considering: [], accept: [] };
}

export function emptyDeliberationsBoardLayout(): DeliberationsBoardLayout {
  return { columns: emptyLayoutColumns(), rejected: [] };
}

/** Default placement when no saved layout exists: advanced → Accept, else Pool. */
export function initialDeliberationsColumns(
  candidates: DeliberationsCandidate[],
): Record<DeliberationsColumnId, DeliberationsCandidate[]> {
  const pool: DeliberationsCandidate[] = [];
  const considering: DeliberationsCandidate[] = [];
  const accept: DeliberationsCandidate[] = [];

  for (const candidate of candidates) {
    const withRejected = { ...candidate, rejected: candidate.rejected ?? false };
    if (candidate.stage === 'advanced') {
      accept.push(withRejected);
    } else {
      pool.push(withRejected);
    }
  }

  return { pool, considering, accept };
}

export function serializeDeliberationsLayout(
  columns: Record<DeliberationsColumnId, DeliberationsCandidate[]>,
): DeliberationsBoardLayout {
  const layoutColumns = emptyLayoutColumns();
  const rejected: number[] = [];

  for (const columnId of DELIBERATIONS_COLUMN_IDS) {
    for (const candidate of columns[columnId] ?? []) {
      layoutColumns[columnId].push(candidate.applicationId);
      if (candidate.rejected) rejected.push(candidate.applicationId);
    }
  }

  rejected.sort((a, b) => a - b);
  return { columns: layoutColumns, rejected };
}

export function layoutsEqual(
  a: DeliberationsBoardLayout,
  b: DeliberationsBoardLayout,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Apply a saved layout onto live candidates (match by applicationId).
 * Candidates not present in the saved state go to Pool.
 * Unknown / stale applicationIds in the layout are dropped.
 */
export function applyDeliberationsLayout(
  candidates: DeliberationsCandidate[],
  layout: DeliberationsBoardLayout | null | undefined,
): Record<DeliberationsColumnId, DeliberationsCandidate[]> {
  if (!layout) return initialDeliberationsColumns(candidates);

  const byId = new Map(
    candidates.map((candidate) => [
      candidate.applicationId,
      { ...candidate, rejected: false },
    ]),
  );
  const rejectedSet = new Set(
    (layout.rejected ?? []).filter((id) => Number.isFinite(id)),
  );
  const placed = new Set<number>();
  const result: Record<DeliberationsColumnId, DeliberationsCandidate[]> = {
    pool: [],
    considering: [],
    accept: [],
  };

  for (const columnId of DELIBERATIONS_COLUMN_IDS) {
    const ids = layout.columns?.[columnId] ?? [];
    for (const rawId of ids) {
      const applicationId = Number(rawId);
      if (!Number.isFinite(applicationId) || placed.has(applicationId)) continue;
      const candidate = byId.get(applicationId);
      if (!candidate) continue;
      placed.add(applicationId);
      result[columnId].push({
        ...candidate,
        rejected: rejectedSet.has(applicationId),
      });
    }
  }

  for (const candidate of candidates) {
    if (placed.has(candidate.applicationId)) continue;
    result.pool.push({ ...candidate, rejected: false });
  }

  return result;
}

/** Parse + validate a layout blob from the DB or API body. Returns null if unusable. */
export function parseDeliberationsBoardLayout(raw: unknown): DeliberationsBoardLayout | null {
  if (raw == null) return null;

  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}') return null;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const columnsRaw = obj.columns;
  if (!columnsRaw || typeof columnsRaw !== 'object' || Array.isArray(columnsRaw)) {
    return null;
  }

  const columnsObj = columnsRaw as Record<string, unknown>;
  const columns = emptyLayoutColumns();
  let hasAny = false;

  for (const columnId of DELIBERATIONS_COLUMN_IDS) {
    const list = columnsObj[columnId];
    if (!Array.isArray(list)) continue;
    const ids: number[] = [];
    for (const item of list) {
      const id = typeof item === 'number' ? item : Number(item);
      if (!Number.isFinite(id) || id < 1) continue;
      ids.push(id);
      hasAny = true;
    }
    columns[columnId] = ids;
  }

  const rejectedRaw = obj.rejected;
  const rejected: number[] = [];
  if (Array.isArray(rejectedRaw)) {
    for (const item of rejectedRaw) {
      const id = typeof item === 'number' ? item : Number(item);
      if (!Number.isFinite(id) || id < 1) continue;
      rejected.push(id);
      hasAny = true;
    }
  }

  if (!hasAny) return null;
  rejected.sort((a, b) => a - b);
  return { columns, rejected };
}
