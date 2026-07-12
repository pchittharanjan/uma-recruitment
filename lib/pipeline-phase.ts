import { getDb, getTeams, rowToRound, type Round, type RoundStatus } from '@/lib/db';
import { cachedPerRequest } from '@/lib/request-cache';
import {
  lockRoundStage,
  unlockRoundStage,
} from '@/lib/stage-access';
import {
  nextRoundStatus,
  phaseLabel,
  statusIndex,
  unlockKeyForStatus,
  type UnlockableStage,
  UNLOCKABLE_STAGES,
} from '@/lib/stages';

export interface TeamPipelineRound {
  teamId: number;
  teamName: string;
  round: Round | null;
}

export interface GlobalPipelineState {
  status: RoundStatus | null;
  nextStatus: RoundStatus | null;
  unlockedStages: UnlockableStage[];
  teams: TeamPipelineRound[];
  teamsWithoutRound: Array<{ teamId: number; teamName: string }>;
  statusDrift: boolean;
  driftedTeams: Array<{ teamId: number; teamName: string; status: RoundStatus }>;
  unlockDrift: boolean;
}

/** One round per team — same preference rules as getActiveRoundForTeam, batched. */
export async function getActiveRoundsByTeam(): Promise<TeamPipelineRound[]> {
  const teams = await getTeams();
  if (teams.length === 0) return [];

  const db = getDb();
  const result = await db.execute(
    `SELECT * FROM (
       SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY team_id
           ORDER BY
             CASE WHEN status = 'closed' THEN 0 ELSE 1 END DESC,
             CASE status
               WHEN 'deliberations' THEN 6
               WHEN 'final_round' THEN 5
               WHEN 'first_round' THEN 4
               WHEN 'application' THEN 3
               WHEN 'pre_application' THEN 2
               WHEN 'setup' THEN 1
               ELSE 0
             END DESC,
             created_at DESC
         ) AS rn
       FROM rounds
     ) WHERE rn = 1`,
  );

  const roundByTeam = new Map<number, Round>();
  for (const row of result.rows) {
    const round = rowToRound(row);
    roundByTeam.set(round.team_id, round);
  }

  return teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    round: roundByTeam.get(team.id) ?? null,
  }));
}

async function loadUnlocksByRoundIds(
  roundIds: number[],
): Promise<Map<number, UnlockableStage[]>> {
  const byRound = new Map<number, UnlockableStage[]>();
  if (roundIds.length === 0) return byRound;

  const db = getDb();
  const placeholders = roundIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT round_id, stage FROM round_stage_unlocks WHERE round_id IN (${placeholders})`,
    args: roundIds,
  });

  for (const row of result.rows) {
    const roundId = row.round_id as number;
    const stage = row.stage as UnlockableStage;
    const list = byRound.get(roundId) ?? [];
    list.push(stage);
    byRound.set(roundId, list);
  }
  return byRound;
}

function canonicalStatus(rounds: Round[]): RoundStatus | null {
  if (rounds.length === 0) return null;
  return rounds.reduce((lowest, round) =>
    statusIndex(round.status) < statusIndex(lowest.status) ? round : lowest,
  ).status;
}

function sameUnlockSet(a: UnlockableStage[], b: UnlockableStage[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((stage) => setA.has(stage));
}

export async function getGlobalPipelineState(): Promise<GlobalPipelineState> {
  return cachedPerRequest('globalPipelineState', getGlobalPipelineStateUncached);
}

async function getGlobalPipelineStateUncached(): Promise<GlobalPipelineState> {
  const teams = await getActiveRoundsByTeam();
  const withRound = teams.filter((t) => t.round !== null) as Array<
    TeamPipelineRound & { round: Round }
  >;
  const teamsWithoutRound = teams
    .filter((t) => t.round === null)
    .map((t) => ({ teamId: t.teamId, teamName: t.teamName }));

  const rounds = withRound.map((t) => t.round);

  // When every active round has been closed, surface status=closed instead of null.
  // (getActiveRoundForTeam now falls back to closed rounds, so this path is rare.)
  if (rounds.length === 0) {
    const db = getDb();
    const closed = await db.execute(
      `SELECT COUNT(*) AS count FROM rounds WHERE status = 'closed'`,
    );
    const closedCount = Number(closed.rows[0]?.count ?? 0);
    if (closedCount > 0) {
      return {
        status: 'closed',
        nextStatus: null,
        // Archive mode: all prior phases remain navigable for viewing.
        unlockedStages: [...UNLOCKABLE_STAGES],
        teams,
        teamsWithoutRound,
        statusDrift: false,
        driftedTeams: [],
        unlockDrift: false,
      };
    }
  }

  const status = canonicalStatus(rounds);
  const driftedTeams = withRound
    .filter((t) => t.round.status !== status)
    .map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      status: t.round.status,
    }));

  const unlocksByRound = await loadUnlocksByRoundIds(rounds.map((r) => r.id));
  const unlockSets = rounds.map((round) => unlocksByRound.get(round.id) ?? []);
  // When closed, treat every unlockable stage as open for viewing (mutations are blocked separately).
  const unlockedStages =
    status === 'closed' ? [...UNLOCKABLE_STAGES] : (unlockSets[0] ?? []);
  const unlockDrift =
    status !== 'closed' &&
    unlockSets.length > 1 &&
    unlockSets.some((set) => !sameUnlockSet(set, unlockSets[0] ?? []));

  return {
    status,
    nextStatus: status ? nextRoundStatus(status) : null,
    unlockedStages,
    teams,
    teamsWithoutRound,
    statusDrift: driftedTeams.length > 0,
    driftedTeams,
    unlockDrift,
  };
}

export interface GlobalPipelineActionResult extends GlobalPipelineState {
  warnings: string[];
}

async function loadStateWithWarnings(warnings: string[]): Promise<GlobalPipelineActionResult> {
  const state = await getGlobalPipelineState();
  return { ...state, warnings };
}

/** Advance every active round to the next pipeline phase (reconciles drift). */
export async function advanceGlobalPipeline(
  unlockedBy: number,
): Promise<GlobalPipelineActionResult> {
  const state = await getGlobalPipelineState();
  const warnings: string[] = [];

  if (state.teamsWithoutRound.length > 0) {
    warnings.push(
      `${state.teamsWithoutRound.map((t) => t.teamName).join(', ')} have no active round yet.`,
    );
  }

  const rounds = state.teams.filter((t) => t.round).map((t) => t.round!);
  if (rounds.length === 0) {
    throw new Error('No active rounds to advance. Import Applications for at least one team first.');
  }

  if (!state.status) {
    throw new Error('Unable to determine current phase.');
  }

  const next = nextRoundStatus(state.status);
  if (!next) {
    throw new Error('Already at the final phase.');
  }

  if (state.statusDrift) {
    warnings.push(
      `Reconciled phase drift: ${state.driftedTeams
        .map((t) => `${t.teamName} (${t.status})`)
        .join(', ')}.`,
    );
  }

  const db = getDb();
  const roundIds = rounds.map((r) => r.id);
  const placeholders = roundIds.map(() => '?').join(', ');
  await db.execute({
    sql: `UPDATE rounds SET status = ? WHERE id IN (${placeholders})`,
    args: [next, ...roundIds],
  });

  const unlockStage = unlockKeyForStatus(next);
  if (unlockStage) {
    await Promise.all(rounds.map((round) => unlockRoundStage(round.id, unlockStage, unlockedBy)));
    warnings.push(`${phaseLabel(next)} reopened for grading on all active teams.`);
  }

  return loadStateWithWarnings(warnings);
}

/** Unlock a grader stage on every active round. */
export async function unlockGlobalStage(
  stage: UnlockableStage,
  unlockedBy: number,
): Promise<GlobalPipelineActionResult> {
  if (!UNLOCKABLE_STAGES.includes(stage)) {
    throw new Error('Invalid stage.');
  }

  const state = await getGlobalPipelineState();
  const warnings: string[] = [];
  const rounds = state.teams.filter((t) => t.round).map((t) => t.round!);

  if (rounds.length === 0) {
    throw new Error('No active rounds. Import Applications for at least one team first.');
  }

  if (state.teamsWithoutRound.length > 0) {
    warnings.push(
      `Unlock applied to teams with active rounds only. Missing: ${state.teamsWithoutRound
        .map((t) => t.teamName)
        .join(', ')}.`,
    );
  }

  await Promise.all(rounds.map((round) => unlockRoundStage(round.id, stage, unlockedBy)));

  return loadStateWithWarnings(warnings);
}

/** Lock a grader stage on every active round. */
export async function lockGlobalStage(stage: UnlockableStage): Promise<GlobalPipelineActionResult> {
  if (!UNLOCKABLE_STAGES.includes(stage)) {
    throw new Error('Invalid stage.');
  }

  const state = await getGlobalPipelineState();
  const rounds = state.teams.filter((t) => t.round).map((t) => t.round!);

  if (rounds.length === 0) {
    throw new Error('No active rounds.');
  }

  await Promise.all(rounds.map((round) => lockRoundStage(round.id, stage)));

  return loadStateWithWarnings([]);
}

/** Apply current global pipeline status and unlocks to a newly created round. */
export async function applyGlobalPipelineToRound(
  roundId: number,
  unlockedBy: number,
): Promise<void> {
  const state = await getGlobalPipelineState();
  if (state.status) {
    const db = getDb();
    await db.execute({
      sql: 'UPDATE rounds SET status = ? WHERE id = ?',
      args: [state.status, roundId],
    });
  }
  for (const stage of state.unlockedStages) {
    await unlockRoundStage(roundId, stage, unlockedBy);
  }
}
