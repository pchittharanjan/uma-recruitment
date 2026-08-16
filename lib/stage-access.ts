import {
  getActiveAccessGrantsForUser,
  getDb,
  type AssignmentStage,
  type User,
} from '@/lib/db';
import { userHasTeamAccess } from '@/lib/access';
import { cachedPerRequest } from '@/lib/request-cache';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  isRoundAtOrPastStatus,
  type UnlockableStage,
  UNLOCKABLE_STAGES,
} from '@/lib/stages';

export interface RoundStageUnlock {
  stage: UnlockableStage;
  unlocked_at: number;
  unlocked_by: number;
}

export async function getRoundStageUnlocks(roundId: number): Promise<RoundStageUnlock[]> {
  return cachedPerRequest(`stageUnlocks:${roundId}`, async () => {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT stage, unlocked_at, unlocked_by FROM round_stage_unlocks WHERE round_id = ?',
      args: [roundId],
    });
    return result.rows.map((row) => ({
      stage: row.stage as UnlockableStage,
      unlocked_at: row.unlocked_at as number,
      unlocked_by: row.unlocked_by as number,
    }));
  });
}

export async function isStageUnlocked(roundId: number, stage: UnlockableStage): Promise<boolean> {
  const unlocks = await getRoundStageUnlocks(roundId);
  return unlocks.some((u) => u.stage === stage);
}

export async function unlockRoundStage(
  roundId: number,
  stage: UnlockableStage,
  unlockedBy: number,
): Promise<void> {
  if (!UNLOCKABLE_STAGES.includes(stage)) {
    throw new Error('Invalid stage.');
  }
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO round_stage_unlocks (round_id, stage, unlocked_by)
          VALUES (?, ?, ?)
          ON CONFLICT(round_id, stage) DO UPDATE SET
            unlocked_at = unixepoch(),
            unlocked_by = excluded.unlocked_by`,
    args: [roundId, stage, unlockedBy],
  });
}

export async function lockRoundStage(roundId: number, stage: UnlockableStage): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM round_stage_unlocks WHERE round_id = ? AND stage = ?',
    args: [roundId, stage],
  });
}

/** Stages this user may access for a team (empty if none). Admins: all unlockable. */
export async function getGrantedStagesForUser(
  user: User,
  teamId: number,
): Promise<UnlockableStage[] | 'all'> {
  if (user.role === 'admin') return 'all';
  if (!(await userHasTeamAccess(user, teamId))) return [];

  if (user.role === 'exec') return 'all';

  const grants = (await getActiveAccessGrantsForUser(user.id)).filter((g) => g.team_id === teamId);
  if (grants.length === 0) return [];

  if (grants.some((g) => g.stage === null)) {
    return 'all';
  }

  const stages = new Set<UnlockableStage>();
  for (const grant of grants) {
    if (grant.stage && UNLOCKABLE_STAGES.includes(grant.stage as UnlockableStage)) {
      stages.add(grant.stage as UnlockableStage);
    }
  }
  return [...stages];
}

/** Interview-only: ad hoc exec scoped to a single interview stage for one team. */
export async function getInterviewOnlyScope(
  user: User,
  teamId: number,
): Promise<AssignmentStage | null> {
  if (user.role !== 'ad_hoc_exec') return null;

  // Archive mode: don't pin the nav to a single interview stage.
  const round = await getActiveRoundForTeam(teamId);
  if (round?.status === 'closed') return null;

  const grants = (await getActiveAccessGrantsForUser(user.id)).filter((g) => g.team_id === teamId);
  if (grants.length !== 1 || grants[0].stage === null) return null;
  const stage = grants[0].stage;
  if (stage === 'first_round' || stage === 'final_round') return stage;
  return null;
}

export async function canUserAccessTeamStage(
  user: User,
  teamId: number,
  stage: UnlockableStage,
): Promise<boolean> {
  if (user.role === 'admin') return true;

  if (!(await userHasTeamAccess(user, teamId))) return false;

  const round = await getActiveRoundForTeam(teamId);
  if (!round) return false;

  // Closed cycle = archive: anyone with team access can view every prior stage
  // (writes stay blocked via assertPipelineWritable / edit locks).
  if (round.status === 'closed') {
    return user.role === 'exec' || user.role === 'ad_hoc_exec';
  }

  const statusForStage =
    stage === 'deliberations'
      ? 'deliberations'
      : stage === 'final_round'
        ? 'final_round'
        : stage === 'first_round'
          ? 'first_round'
          : 'application';

  if (!isRoundAtOrPastStatus(round.status, statusForStage)) return false;
  if (!(await isStageUnlocked(round.id, stage))) return false;

  const granted = await getGrantedStagesForUser(user, teamId);
  if (granted === 'all') {
    // Deliberations is view/play for all team-portal roles; only admin can save/advance (API + UI).
    return user.role === 'exec' || user.role === 'ad_hoc_exec';
  }
  if (granted.length === 0) return false;
  return granted.includes(stage);
}

/**
 * New rounds start with no grader unlocks.
 * Admins unlock Application (and later stages) from Dashboard → Stage access
 * after setup is ready — so execs don't see "Start grading" during import.
 */
export async function seedDefaultUnlocksForRound(
  _roundId: number,
  _unlockedBy: number,
): Promise<void> {
  // Intentionally empty — unlocks are admin-controlled.
}
