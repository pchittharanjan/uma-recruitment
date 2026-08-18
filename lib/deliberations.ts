import 'server-only';

import { resolveApplicantEmail } from '@/lib/candidates';
import { getDb, getTeamById } from '@/lib/db';
import { getTeamAdvancementCapState } from '@/lib/team-advancement-caps';
import {
  deliberationsSortScore,
  deliberationsPendingStages,
  getTeamPipelineProfile,
} from '@/lib/team-pipeline-profile';
import type {
  DeliberationsBoardData,
  DeliberationsBoardLayout,
  DeliberationsCandidate,
  DeliberationsCandidateDetail,
  DeliberationsFlag,
  DeliberationsScoreEntry,
} from '@/lib/deliberations-types';
import { parseDeliberationsBoardLayout } from '@/lib/deliberations-types';

export type {
  DeliberationsBoardData,
  DeliberationsBoardLayout,
  DeliberationsCandidate,
  DeliberationsCandidateDetail,
  DeliberationsColumnId,
  DeliberationsFlag,
  DeliberationsScoreEntry,
} from '@/lib/deliberations-types';
export {
  applyDeliberationsLayout,
  initialDeliberationsColumns,
  parseDeliberationsBoardLayout,
  serializeDeliberationsLayout,
} from '@/lib/deliberations-types';

type ScoreStage = 'application' | 'first_round' | 'final_round';

/**
 * Mean of all field scores on completed assignments for a stage.
 * Prefer this over `applications.final_score` / `rank`, which get overwritten
 * when advancing first → final round.
 */
async function loadStageAverages(
  applicationIds: number[],
  stage: ScoreStage,
): Promise<Map<number, number>> {
  const averages = new Map<number, number>();
  if (applicationIds.length === 0) return averages;

  const db = getDb();
  const placeholders = applicationIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT a.application_id AS application_id,
                 AVG(CAST(s.score AS REAL)) AS avg_score
          FROM assignments a
          JOIN scores s ON s.assignment_id = a.id
          WHERE a.stage = ?
            AND a.status = 'completed'
            AND a.application_id IN (${placeholders})
          GROUP BY a.application_id`,
    args: [stage, ...applicationIds],
  });

  for (const row of result.rows) {
    const applicationId = Number(row.application_id);
    const avg = Number(row.avg_score);
    if (!Number.isFinite(applicationId) || !Number.isFinite(avg)) continue;
    averages.set(applicationId, Math.round(avg * 1000) / 1000);
  }
  return averages;
}

async function loadAllStageReviews(
  applicationId: number,
  teamId: number,
): Promise<Record<ScoreStage, DeliberationsScoreEntry[]>> {
  const empty: Record<ScoreStage, DeliberationsScoreEntry[]> = {
    application: [],
    first_round: [],
    final_round: [],
  };
  const db = getDb();

  const assignmentsResult = await db.execute({
    sql: `SELECT a.id AS assignment_id, a.stage, a.status, a.comment, u.name AS reviewer_name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN users u ON u.id = a.user_id
          WHERE a.application_id = ?
            AND app.team_id = ?
            AND a.stage IN ('application', 'first_round', 'final_round')
          ORDER BY u.name ASC`,
    args: [applicationId, teamId],
  });

  if (assignmentsResult.rows.length === 0) return empty;

  const assignmentIds = assignmentsResult.rows.map((row) => row.assignment_id as number);
  const placeholders = assignmentIds.map(() => '?').join(',');
  const scoresResult = await db.execute({
    sql: `SELECT assignment_id, field_name, score
          FROM scores
          WHERE assignment_id IN (${placeholders})`,
    args: assignmentIds,
  });

  const scoresByAssignment = new Map<number, Record<string, number>>();
  for (const row of scoresResult.rows) {
    const assignmentId = row.assignment_id as number;
    const score = row.score as number | null;
    if (score == null) continue;
    if (!scoresByAssignment.has(assignmentId)) scoresByAssignment.set(assignmentId, {});
    scoresByAssignment.get(assignmentId)![row.field_name as string] = score;
  }

  for (const row of assignmentsResult.rows) {
    const stage = row.stage as ScoreStage;
    if (!(stage in empty)) continue;
    const assignmentId = row.assignment_id as number;
    const scores = scoresByAssignment.get(assignmentId) ?? {};
    const values = Object.values(scores);
    const average =
      values.length > 0
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) /
          1000
        : null;
    empty[stage].push({
      reviewerName: (row.reviewer_name as string) || 'Unknown',
      status: row.status as string,
      scores,
      average,
      comment: (row.comment as string | null) ?? null,
    });
  }

  return empty;
}

export async function getDeliberationsBoardLayout(
  teamId: number,
  roundId: number,
): Promise<DeliberationsBoardLayout | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT layout_json
          FROM deliberation_boards
          WHERE team_id = ? AND round_id = ?`,
    args: [teamId, roundId],
  });
  if (result.rows.length === 0) return null;
  return parseDeliberationsBoardLayout(result.rows[0]!.layout_json);
}

export async function saveDeliberationsBoardLayout(
  teamId: number,
  roundId: number,
  layout: DeliberationsBoardLayout,
  updatedBy: number | null,
): Promise<DeliberationsBoardLayout> {
  const db = getDb();
  const layoutJson = JSON.stringify(layout);
  await db.execute({
    sql: `INSERT INTO deliberation_boards (team_id, round_id, layout_json, updated_at, updated_by)
          VALUES (?, ?, ?, unixepoch(), ?)
          ON CONFLICT(team_id, round_id) DO UPDATE SET
            layout_json = excluded.layout_json,
            updated_at = unixepoch(),
            updated_by = excluded.updated_by`,
    args: [teamId, roundId, layoutJson, updatedBy],
  });
  return layout;
}

/**
 * Pool for deliberations: applicants still in final round / deliberations,
 * plus anyone already marked advanced (offer) so the Accept column can seed.
 */
export async function buildDeliberationsBoard(
  teamId: number,
  roundId: number,
): Promise<DeliberationsBoardData> {
  const db = getDb();
  const team = await getTeamById(teamId);
  const teamName = team?.name ?? 'Strategy';
  const profile = getTeamPipelineProfile(teamName);
  const poolStages = profile.deliberationsPoolStages;
  const stagePlaceholders = poolStages.map(() => '?').join(', ');
  const { cap, allowOverCap } = await getTeamAdvancementCapState(teamId, 'deliberations');

  const appsResult = await db.execute({
    sql: `SELECT app.id, app.row_index, app.stage, c.name AS candidate_name
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          WHERE app.team_id = ? AND app.round_id = ?
            AND app.stage IN (${stagePlaceholders})
          ORDER BY app.row_index ASC`,
    args: [teamId, roundId, ...poolStages],
  });

  const appIds = appsResult.rows.map((row) => Number(row.id)).filter(Number.isFinite);
  const [applicationAvgs, firstRoundAvgs, finalRoundAvgs, layout] = await Promise.all([
    loadStageAverages(appIds, 'application'),
    loadStageAverages(appIds, 'first_round'),
    loadStageAverages(appIds, 'final_round'),
    getDeliberationsBoardLayout(teamId, roundId),
  ]);

  const candidates: DeliberationsCandidate[] = appsResult.rows.map((row) => {
    const applicationId = Number(row.id);
    return {
      id: String(applicationId),
      applicationId,
      rowIndex: (row.row_index as number | null) ?? 0,
      name: (row.candidate_name as string) || `Applicant ${applicationId}`,
      stage: row.stage as string,
      // Always from stage-scoped assignment scores — never applications.final_score
      // (that column is overwritten when advancing first → final).
      applicationScore: applicationAvgs.get(applicationId) ?? null,
      firstRoundAverage: firstRoundAvgs.get(applicationId) ?? null,
      finalRoundAverage: finalRoundAvgs.get(applicationId) ?? null,
      rejected: false,
    };
  });

  candidates.sort((a, b) => {
    const diff = deliberationsSortScore(b, teamName) - deliberationsSortScore(a, teamName);
    if (diff !== 0) return diff;
    return a.rowIndex - b.rowIndex;
  });

  return {
    teamId,
    roundId,
    acceptLimit: cap,
    allowOverCap,
    candidates,
    layout,
  };
}

export interface DeliberationsFinalSelectionResult {
  teamId: number;
  roundId: number;
  offeredCount: number;
  rejectedCount: number;
  offeredApplicationIds: number[];
}

/**
 * True when this team has locked Accept → offers on the deliberations board.
 *
 * `rejected` is also used when cutting applicants at Application / First Round,
 * so it must not count as “final selection complete” on its own. Offers are
 * the `advanced` stage, and only after the round has reached deliberations.
 */
export async function isDeliberationsFinalSelectionComplete(
  teamId: number,
  roundId: number,
): Promise<boolean> {
  const db = getDb();
  const round = await db.execute({
    sql: `SELECT status FROM rounds WHERE id = ? AND team_id = ?`,
    args: [roundId, teamId],
  });
  const status = round.rows[0]?.status;
  if (status !== 'deliberations' && status !== 'closed') return false;

  const team = await getTeamById(teamId);
  const pendingStages = deliberationsPendingStages(team?.name ?? 'Strategy');
  const pendingPlaceholders = pendingStages.map(() => '?').join(', ');

  const pending = await db.execute({
    sql: `SELECT COUNT(*) AS count
          FROM applications
          WHERE team_id = ? AND round_id = ?
            AND stage IN (${pendingPlaceholders})`,
    args: [teamId, roundId, ...pendingStages],
  });
  const pendingCount = Number(pending.rows[0]?.count ?? 0);
  if (pendingCount > 0) return false;

  const offered = await db.execute({
    sql: `SELECT COUNT(*) AS count
          FROM applications
          WHERE team_id = ? AND round_id = ?
            AND stage = 'advanced'`,
    args: [teamId, roundId],
  });
  return Number(offered.rows[0]?.count ?? 0) > 0;
}

export async function countTeamsWithCompleteFinalSelection(
  teams: Array<{ teamId: number; roundId: number }>,
): Promise<number> {
  if (teams.length === 0) return 0;
  const flags = await Promise.all(
    teams.map((t) => isDeliberationsFinalSelectionComplete(t.teamId, t.roundId)),
  );
  return flags.filter(Boolean).length;
}

/**
 * Lock Accept-column offers: accept → advanced, everyone else still in
 * final_round/deliberations → rejected. Persists the board layout first.
 */
export async function commitDeliberationsFinalSelection(
  teamId: number,
  roundId: number,
  layout: DeliberationsBoardLayout,
  updatedBy: number,
): Promise<DeliberationsFinalSelectionResult> {
  const board = await buildDeliberationsBoard(teamId, roundId);
  if (await isDeliberationsFinalSelectionComplete(teamId, roundId)) {
    throw new Error('Final selection is already complete for this team.');
  }

  const candidateIds = new Set(board.candidates.map((c) => c.applicationId));
  const acceptIds = layout.columns.accept.filter((id) => candidateIds.has(id));
  const acceptSet = new Set(acceptIds);

  if (acceptIds.length === 0) {
    throw new Error('Move at least one applicant into Accept before completing final selection.');
  }

  if (
    board.acceptLimit != null &&
    !board.allowOverCap &&
    acceptIds.length > board.acceptLimit
  ) {
    throw new Error(
      `Accept has ${acceptIds.length} applicants but the offer limit is ${board.acceptLimit}.`,
    );
  }

  // Anyone on the board not in Accept (including rejected marks) is cut.
  const rejectIds = board.candidates
    .map((c) => c.applicationId)
    .filter((id) => !acceptSet.has(id));

  await saveDeliberationsBoardLayout(teamId, roundId, layout, updatedBy);

  const db = getDb();
  const team = await getTeamById(teamId);
  const poolStages = getTeamPipelineProfile(team?.name ?? 'Strategy').deliberationsPoolStages;
  const poolPlaceholders = poolStages.map(() => '?').join(', ');
  const pendingStages = deliberationsPendingStages(team?.name ?? 'Strategy');
  const pendingPlaceholders = pendingStages.map(() => '?').join(', ');

  for (const applicationId of acceptIds) {
    await db.execute({
      sql: `UPDATE applications
            SET stage = 'advanced'
            WHERE id = ? AND team_id = ? AND round_id = ?
              AND stage IN (${poolPlaceholders})`,
      args: [applicationId, teamId, roundId, ...poolStages],
    });
  }

  for (const applicationId of rejectIds) {
    await db.execute({
      sql: `UPDATE applications
            SET stage = 'rejected'
            WHERE id = ? AND team_id = ? AND round_id = ?
              AND stage IN (${pendingPlaceholders})`,
      args: [applicationId, teamId, roundId, ...pendingStages],
    });
  }

  return {
    teamId,
    roundId,
    offeredCount: acceptIds.length,
    rejectedCount: rejectIds.length,
    offeredApplicationIds: acceptIds,
  };
}

/** Unified candidate view for deliberations — the allowed merge point. */
export async function buildDeliberationsCandidateDetail(
  teamId: number,
  roundId: number,
  applicationId: number,
): Promise<DeliberationsCandidateDetail | null> {
  const db = getDb();

  const team = await getTeamById(teamId);
  const teamName = team?.name ?? 'Strategy';
  const profile = getTeamPipelineProfile(teamName);
  const poolStages = profile.deliberationsPoolStages;
  const stagePlaceholders = poolStages.map(() => '?').join(', ');

  const appResult = await db.execute({
    sql: `SELECT app.id, app.row_index, app.stage, app.admin_note, app.fields,
                 c.name AS candidate_name, c.email AS candidate_email
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          WHERE app.id = ? AND app.team_id = ? AND app.round_id = ?
            AND app.stage IN (${stagePlaceholders})`,
    args: [applicationId, teamId, roundId, ...poolStages],
  });

  if (appResult.rows.length === 0) return null;

  const row = appResult.rows[0]!;
  let fields: Record<string, string> = {};
  try {
    const parsed = JSON.parse((row.fields as string) || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fields = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
          key,
          value == null ? '' : String(value),
        ]),
      );
    }
  } catch {
    fields = {};
  }

  const [applicationAvgs, firstRoundAvgs, finalRoundAvgs, reviewsByStage, flagsResult] =
    await Promise.all([
      loadStageAverages([applicationId], 'application'),
      loadStageAverages([applicationId], 'first_round'),
      loadStageAverages([applicationId], 'final_round'),
      loadAllStageReviews(applicationId, teamId),
      db.execute({
        sql: `SELECT f.color, f.note, f.created_at, u.name AS author_name
              FROM flags f
              JOIN users u ON u.id = f.author_id
              WHERE f.application_id = ?
              ORDER BY f.created_at DESC`,
        args: [applicationId],
      }),
    ]);

  const flags: DeliberationsFlag[] = flagsResult.rows.map((flagRow) => ({
    color: flagRow.color as 'red' | 'green',
    note: (flagRow.note as string | null) ?? null,
    authorName: (flagRow.author_name as string) || 'Unknown',
    createdAt: (flagRow.created_at as number) ?? 0,
  }));

  return {
    applicationId,
    rowIndex: (row.row_index as number | null) ?? 0,
    name: (row.candidate_name as string) || `Applicant ${applicationId}`,
    email: resolveApplicantEmail(fields, (row.candidate_email as string | null) ?? ''),
    stage: row.stage as string,
    adminNote: (row.admin_note as string | null) ?? null,
    fields,
    phaseAverages: {
      application: applicationAvgs.get(applicationId) ?? null,
      firstRound: firstRoundAvgs.get(applicationId) ?? null,
      finalRound: finalRoundAvgs.get(applicationId) ?? null,
    },
    applicationReviews: reviewsByStage.application,
    firstRoundReviews: reviewsByStage.first_round,
    finalRoundReviews: reviewsByStage.final_round,
    flags,
  };
}

/** Batch load candidate details for compare views — fewer round-trips than N single fetches. */
export async function buildDeliberationsCandidateDetails(
  teamId: number,
  roundId: number,
  applicationIds: number[],
): Promise<DeliberationsCandidateDetail[]> {
  const uniqueIds = [...new Set(applicationIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) return [];

  const details = await Promise.all(
    uniqueIds.map((id) => buildDeliberationsCandidateDetail(teamId, roundId, id)),
  );
  return details.filter((d): d is DeliberationsCandidateDetail => d != null);
}
