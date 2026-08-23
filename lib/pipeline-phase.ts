import { getDb, getTeamById, getTeams, rowToRound, type ApplicationStage, type Round, type RoundStatus } from '@/lib/db';
import { cachedPerRequest } from '@/lib/request-cache';
import { getLatestAdvancementSubmission } from '@/lib/advancement-submissions';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import {
  lockRoundStage,
  unlockRoundStage,
} from '@/lib/stage-access';
import {
  isFutureUnlockStage,
  nextRoundStatus,
  phaseLabel,
  roundStatusForUnlockStage,
  statusIndex,
  unlockKeyForStatus,
  type UnlockableStage,
  UNLOCKABLE_STAGES,
} from '@/lib/stages';
import {
  COHORT_STRATEGY_EVENTS,
  getTeamPipelineProfile,
  nextPipelineStatusForTeam,
  phaseLabelForTeam,
  pipelinePhasesForTeam,
  previousPipelineStatusForTeam,
} from '@/lib/team-pipeline-profile';

/** Teams that share bulk-advance actions on the admin dashboard. */
export { COHORT_STRATEGY_EVENTS } from '@/lib/team-pipeline-profile';

export interface TeamPipelineRound {
  teamId: number;
  teamName: string;
  round: Round | null;
  unlockedStages: UnlockableStage[];
  phaseRevert?: TeamPhaseRevertInfo;
}

export interface TeamPhaseRevertInfo {
  canRevert: boolean;
  revertBlockedReason: string | null;
  previousStatus: RoundStatus | null;
  blockingApplicantCount: number;
}

const REVERTIBLE_ROUND_STATUSES = new Set<RoundStatus>([
  'pre_application',
  'application',
  'first_round',
  'final_round',
  'deliberations',
]);

function applicantStagesBlockingPhaseRevert(roundStatus: RoundStatus): ApplicationStage[] {
  switch (roundStatus) {
    case 'application':
      return [
        'application',
        'first_round',
        'final_round',
        'deliberations',
        'advanced',
        'rejected',
      ];
    case 'first_round':
      return ['first_round', 'final_round', 'deliberations', 'advanced', 'rejected'];
    case 'final_round':
      return ['final_round', 'deliberations', 'advanced', 'rejected'];
    case 'deliberations':
      return ['deliberations', 'advanced'];
    default:
      return [];
  }
}

function advancementFromStageForPhaseRevert(roundStatus: RoundStatus): AdvancementFromStage | null {
  switch (roundStatus) {
    case 'first_round':
      return 'application';
    case 'final_round':
    case 'deliberations':
      return 'first_round';
    default:
      return null;
  }
}

async function buildTeamPhaseRevertInfo(
  teamName: string,
  round: Round,
  stageCounts: Map<ApplicationStage, number>,
  totalApplications: number,
): Promise<TeamPhaseRevertInfo> {
  const current = round.status;
  const previous = previousPipelineStatusForTeam(current, teamName);

  if (!previous || !REVERTIBLE_ROUND_STATUSES.has(current)) {
    return {
      canRevert: false,
      revertBlockedReason: null,
      previousStatus: previous,
      blockingApplicantCount: 0,
    };
  }

  if (current === 'application' && totalApplications > 0) {
    return {
      canRevert: false,
      revertBlockedReason: null,
      previousStatus: previous,
      blockingApplicantCount: totalApplications,
    };
  }

  const blockingStages = applicantStagesBlockingPhaseRevert(current);
  const blockingApplicantCount = blockingStages.reduce(
    (sum, stage) => sum + (stageCounts.get(stage) ?? 0),
    0,
  );

  return {
    canRevert: true,
    revertBlockedReason: null,
    previousStatus: previous,
    blockingApplicantCount,
  };
}

function targetApplicationStageForRoundStatus(status: RoundStatus): ApplicationStage | null {
  switch (status) {
    case 'application':
      return 'application';
    case 'first_round':
      return 'first_round';
    case 'final_round':
      return 'final_round';
    case 'deliberations':
      return 'deliberations';
    default:
      return null;
  }
}

async function loadPhaseRevertByTeamId(
  teams: Array<TeamPipelineRound & { round: Round }>,
): Promise<Map<number, TeamPhaseRevertInfo>> {
  const byTeam = new Map<number, TeamPhaseRevertInfo>();
  if (teams.length === 0) return byTeam;

  const db = getDb();
  const roundIds = teams.map((t) => t.round.id);
  const placeholders = roundIds.map(() => '?').join(',');
  const countsResult = await db.execute({
    sql: `SELECT round_id, stage, COUNT(*) AS count
          FROM applications
          WHERE round_id IN (${placeholders})
          GROUP BY round_id, stage`,
    args: roundIds,
  });

  const stageCountsByRound = new Map<number, Map<ApplicationStage, number>>();
  const totalAppsByRound = new Map<number, number>();
  for (const row of countsResult.rows) {
    const roundId = row.round_id as number;
    const stage = row.stage as ApplicationStage;
    const count = Number(row.count ?? 0);
    const stageCounts = stageCountsByRound.get(roundId) ?? new Map<ApplicationStage, number>();
    stageCounts.set(stage, count);
    stageCountsByRound.set(roundId, stageCounts);
    totalAppsByRound.set(roundId, (totalAppsByRound.get(roundId) ?? 0) + count);
  }

  await Promise.all(
    teams.map(async (entry) => {
      const stageCounts = stageCountsByRound.get(entry.round.id) ?? new Map();
      const totalApplications = totalAppsByRound.get(entry.round.id) ?? 0;
      const info = await buildTeamPhaseRevertInfo(
        entry.teamName,
        entry.round,
        stageCounts,
        totalApplications,
      );
      byTeam.set(entry.teamId, info);
    }),
  );

  return byTeam;
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

  const roundIds = [...roundByTeam.values()].map((r) => r.id);
  const unlocksByRound = await loadUnlocksByRoundIds(roundIds);

  const entries = teams.map((team) => {
    const round = roundByTeam.get(team.id) ?? null;
    return {
      teamId: team.id,
      teamName: team.name,
      round,
      unlockedStages: round ? (unlocksByRound.get(round.id) ?? []) : [],
    };
  });

  const withRound = entries.flatMap((entry) =>
    entry.round
      ? [{ teamId: entry.teamId, teamName: entry.teamName, round: entry.round, unlockedStages: entry.unlockedStages }]
      : [],
  );
  const phaseRevertByTeam = await loadPhaseRevertByTeamId(withRound);

  return entries.map((entry) => ({
    ...entry,
    phaseRevert: entry.round ? phaseRevertByTeam.get(entry.teamId) : undefined,
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
  const teamsWithUnlocks = teams;

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
        teams: teamsWithUnlocks,
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
    teams: teamsWithUnlocks,
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
  _unlockedBy: number,
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

  if (!nextRoundStatus(state.status)) {
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
  for (const entry of state.teams) {
    if (!entry.round) continue;
    const next = nextPipelineStatusForTeam(entry.round.status, entry.teamName);
    if (!next) continue;
    await db.execute({
      sql: 'UPDATE rounds SET status = ? WHERE id = ?',
      args: [next, entry.round.id],
    });
    if (
      getTeamPipelineProfile(entry.teamName).autoUnlockDeliberations &&
      next === 'deliberations'
    ) {
      await unlockRoundStage(entry.round.id, 'deliberations', _unlockedBy);
    }
  }

  // Do not auto-unlock grader access (except Design deliberations above).
  // Admins set up the phase while the stage stays locked; they open grading from Stage access.
  const sampleNext = state.teams.find((t) => t.round)
    ? nextPipelineStatusForTeam(
        state.teams.find((t) => t.round)!.round!.status,
        state.teams.find((t) => t.round)!.teamName,
      )
    : null;
  const unlockStage = sampleNext ? unlockKeyForStatus(sampleNext) : null;
  if (unlockStage && unlockStage !== 'deliberations') {
    warnings.push(
      `${phaseLabel(sampleNext!)} is ready for setup. Click to unlock each phase on the dashboard when graders should start.`,
    );
  }

  return loadStateWithWarnings(warnings);
}

/** Advance selected teams to each team's profile-specific next phase. */
export async function advanceTeamsPipeline(
  teamIds: number[],
  unlockedBy: number,
): Promise<GlobalPipelineActionResult> {
  if (teamIds.length === 0) {
    throw new Error('No teams selected.');
  }

  const state = await getGlobalPipelineState();
  const warnings: string[] = [];
  const idSet = new Set(teamIds);
  const targets = state.teams.filter((t) => idSet.has(t.teamId) && t.round);

  if (targets.length === 0) {
    throw new Error('No active rounds found for the selected teams.');
  }

  const missingRound = state.teams.filter((t) => idSet.has(t.teamId) && !t.round);
  if (missingRound.length > 0) {
    warnings.push(
      `${missingRound.map((t) => t.teamName).join(', ')} have no active round yet.`,
    );
  }

  const db = getDb();
  let advancedCount = 0;

  for (const entry of targets) {
    const round = entry.round!;
    const next = nextPipelineStatusForTeam(round.status, entry.teamName);
    if (!next) {
      warnings.push(`${entry.teamName} is already at the final phase.`);
      continue;
    }

    await db.execute({
      sql: 'UPDATE rounds SET status = ? WHERE id = ?',
      args: [next, round.id],
    });
    advancedCount += 1;

    if (
      getTeamPipelineProfile(entry.teamName).autoUnlockDeliberations &&
      next === 'deliberations'
    ) {
      await unlockRoundStage(round.id, 'deliberations', unlockedBy);
    } else {
      const unlockStage = unlockKeyForStatus(next);
      if (unlockStage) {
        warnings.push(
          `${phaseLabelForTeam(next, entry.teamName)} is ready for ${entry.teamName}. Unlock it when graders should start.`,
        );
      }
    }
  }

  if (advancedCount === 0) {
    throw new Error('Selected teams are already at the final phase.');
  }

  return loadStateWithWarnings(warnings);
}

/** Resolve team ids for Strategy + Events (bulk cohort advance). */
export async function strategyEventsTeamIds(): Promise<number[]> {
  const teams = await getTeams();
  return teams
    .filter((t) => (COHORT_STRATEGY_EVENTS as readonly string[]).includes(t.name))
    .map((t) => t.id);
}

/** One-line admin summary: "Strategy: Final Round · Events: … · Design: …". */
export function formatTeamStatusSummary(teams: TeamPipelineRound[]): string {
  const withRound = teams.filter((t) => t.round);
  if (withRound.length === 0) return 'Not started';
  return withRound
    .map((t) => `${t.teamName}: ${phaseLabelForTeam(t.round!.status, t.teamName)}`)
    .join(' · ');
}

/** Default dashboard browse phase — slowest active team (legacy canonical behavior). */
export function suggestedDashboardViewPhase(teams: TeamPipelineRound[]): RoundStatus {
  const statuses = teams.filter((t) => t.round).map((t) => t.round!.status);
  if (statuses.length === 0) return 'pre_application';
  const active = statuses.filter((s) => s !== 'closed');
  if (active.length === 0) return 'deliberations';
  return active.reduce((lowest, status) =>
    statusIndex(status) < statusIndex(lowest) ? status : lowest,
  );
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

  if (stage === 'application') {
    const { notifyApplicationUnlocked } = await import('@/lib/notifications');
    await notifyApplicationUnlocked(rounds.map((r) => r.id));
  }

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

export interface TeamPipelineActionResult {
  teamId: number;
  teamName: string;
  round: Round;
  status: RoundStatus;
  nextStatus: RoundStatus | null;
  unlockedStages: UnlockableStage[];
  warnings: string[];
}

async function loadTeamActionResult(
  teamId: number,
  teamName: string,
  round: Round,
  warnings: string[],
): Promise<TeamPipelineActionResult> {
  const unlocks = await loadUnlocksByRoundIds([round.id]);
  return {
    teamId,
    teamName,
    round,
    status: round.status,
    nextStatus: nextPipelineStatusForTeam(round.status, teamName),
    unlockedStages: unlocks.get(round.id) ?? [],
    warnings,
  };
}

/** Advance one team's round to its profile-specific next phase. */
export async function advanceTeamPipeline(
  teamId: number,
  unlockedBy: number,
): Promise<TeamPipelineActionResult> {
  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const round = (await getActiveRoundsByTeam()).find((t) => t.teamId === teamId)?.round;
  if (!round) {
    throw new Error(`${team.name} has no active round. Import applications first.`);
  }

  const next = nextPipelineStatusForTeam(round.status, team.name);
  if (!next) {
    throw new Error(`${team.name} is already at the final phase.`);
  }

  const db = getDb();
  await db.execute({
    sql: 'UPDATE rounds SET status = ? WHERE id = ?',
    args: [next, round.id],
  });

  const warnings: string[] = [];
  const closedLabels: string[] = [];
  for (const phase of pipelinePhasesForTeam(team.name)) {
    const key = phase.unlockKey;
    if (!key) continue;
    if (statusIndex(phase.status) < statusIndex(next)) {
      await lockRoundStage(round.id, key);
      closedLabels.push(phaseLabelForTeam(phase.status, team.name));
    }
  }
  if (closedLabels.length > 0) {
    warnings.push(`Team access closed for: ${closedLabels.join(', ')}.`);
  }

  const profile = getTeamPipelineProfile(team.name);
  if (profile.autoUnlockDeliberations && next === 'deliberations') {
    await unlockRoundStage(round.id, 'deliberations', unlockedBy);
    warnings.push(`Deliberations unlocked for ${team.name}.`);
  } else {
    const unlockStage = unlockKeyForStatus(next);
    if (unlockStage) {
      warnings.push(
        `Check ${phaseLabelForTeam(next, team.name)} below when ${team.name} should start working.`,
      );
    }
  }

  const updated = { ...round, status: next };
  return loadTeamActionResult(teamId, team.name, updated, warnings);
}

/** Move one team's official phase back one step (admin undo for mistaken advance). */
export async function revertTeamPipeline(
  teamId: number,
  adminId: number,
): Promise<TeamPipelineActionResult> {
  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const entry = (await getActiveRoundsByTeam()).find((t) => t.teamId === teamId);
  const round = entry?.round;
  if (!round) {
    throw new Error(`${team.name} has no active round.`);
  }

  const db = getDb();
  const countsResult = await db.execute({
    sql: `SELECT stage, COUNT(*) AS count
          FROM applications
          WHERE round_id = ?
          GROUP BY stage`,
    args: [round.id],
  });
  const stageCounts = new Map<ApplicationStage, number>();
  let totalApplications = 0;
  for (const row of countsResult.rows) {
    const stage = row.stage as ApplicationStage;
    const count = Number(row.count ?? 0);
    stageCounts.set(stage, count);
    totalApplications += count;
  }

  const revertInfo = await buildTeamPhaseRevertInfo(
    team.name,
    round,
    stageCounts,
    totalApplications,
  );

  if (!revertInfo.canRevert || !revertInfo.previousStatus) {
    throw new Error('This phase cannot be moved back.');
  }

  const previous = revertInfo.previousStatus;
  const current = round.status;
  const warnings: string[] = [];

  const targetApplicantStage = targetApplicationStageForRoundStatus(previous);
  const sourceStages = applicantStagesBlockingPhaseRevert(current);
  if (targetApplicantStage && sourceStages.length > 0) {
    const placeholders = sourceStages.map(() => '?').join(', ');
    const updateResult = await db.execute({
      sql: `UPDATE applications
            SET stage = ?, final_score = NULL, rank = NULL, rejected_from_stage = NULL
            WHERE team_id = ? AND round_id = ? AND stage IN (${placeholders})`,
      args: [targetApplicantStage, teamId, round.id, ...sourceStages],
    });
    const revertedCount = updateResult.rowsAffected ?? 0;
    if (revertedCount > 0) {
      warnings.push(
        `Moved ${revertedCount} applicant(s) back to ${phaseLabelForTeam(previous, team.name)}.`,
      );
    }
  }

  const fromStage = advancementFromStageForPhaseRevert(current);
  if (fromStage) {
    const submission = await getLatestAdvancementSubmission(teamId, round.id, fromStage);
    if (submission && (submission.status === 'approved' || submission.status === 'submitted')) {
      await db.execute({
        sql: `UPDATE team_advancement_submissions
              SET status = 'withdrawn', reviewed_by = ?, reviewed_at = unixepoch()
              WHERE id = ?`,
        args: [adminId, submission.id],
      });
    }
  }

  await db.execute({
    sql: 'UPDATE rounds SET status = ? WHERE id = ?',
    args: [previous, round.id],
  });

  const leavingUnlock = unlockKeyForStatus(current);
  if (leavingUnlock) {
    await lockRoundStage(round.id, leavingUnlock);
    warnings.push(
      `${phaseLabelForTeam(current, team.name)} exec access closed. Re-check unlock boxes if ${team.name} should work in ${phaseLabelForTeam(previous, team.name)}.`,
    );
  }

  warnings.unshift(`Moved ${team.name} back to ${phaseLabelForTeam(previous, team.name)}.`);

  const updated = { ...round, status: previous };
  return loadTeamActionResult(teamId, team.name, updated, warnings);
}

/** Unlock a grader stage for one team. */
export async function unlockTeamStage(
  teamId: number,
  stage: UnlockableStage,
  unlockedBy: number,
): Promise<TeamPipelineActionResult> {
  if (!UNLOCKABLE_STAGES.includes(stage)) {
    throw new Error('Invalid stage.');
  }

  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const entry = (await getActiveRoundsByTeam()).find((t) => t.teamId === teamId);
  const round = entry?.round;
  if (!round) {
    throw new Error(`${team.name} has no active round.`);
  }

  if (isFutureUnlockStage(round.status, stage)) {
    throw new Error(
      `Advance ${team.name} to ${phaseLabelForTeam(roundStatusForUnlockStage(stage), team.name)} before opening team access.`,
    );
  }

  await unlockRoundStage(round.id, stage, unlockedBy);

  if (stage === 'application') {
    const { notifyApplicationUnlocked } = await import('@/lib/notifications');
    await notifyApplicationUnlocked([round.id]);
  }

  return loadTeamActionResult(teamId, team.name, round, []);
}

/** Lock a grader stage for one team. */
export async function lockTeamStage(
  teamId: number,
  stage: UnlockableStage,
): Promise<TeamPipelineActionResult> {
  if (!UNLOCKABLE_STAGES.includes(stage)) {
    throw new Error('Invalid stage.');
  }

  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const entry = (await getActiveRoundsByTeam()).find((t) => t.teamId === teamId);
  const round = entry?.round;
  if (!round) {
    throw new Error(`${team.name} has no active round.`);
  }

  await lockRoundStage(round.id, stage);
  return loadTeamActionResult(teamId, team.name, round, []);
}
