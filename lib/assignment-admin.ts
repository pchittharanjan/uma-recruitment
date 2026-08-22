import 'server-only';

import { getDb, getTeamById } from '@/lib/db';
import { getActiveRoundForTeam, getRoundSettings } from '@/lib/rounds';
import {
  DEFAULT_GRADERS_PER_APPLICATION,
  loadSummary,
  planMoveRemaining,
  planRebalance,
  planSetLoad,
  type AssignmentMove,
  type AssignmentWorkStatus,
  type LiveAssignment,
  type LoadSummary,
} from '@/lib/assignments';
import { EXEC_ROLE_SQL_VALUES } from '@/lib/roles';
import { displayApplicantId } from '@/lib/applicant-id';

export interface AssignmentReviewEntry {
  assignmentId: number;
  applicationId: number;
  rowIndex: number;
  applicantNumber: number;
  candidateName: string;
  candidateEmail: string;
  status: AssignmentWorkStatus;
  hasScores: boolean;
}

export interface AssignmentReviewGrader {
  id: number;
  name: string;
  email: string;
  total: number;
  completed: number;
  movable: number;
  assignments: AssignmentReviewEntry[];
}

export interface AssignmentReviewState {
  team: { id: number; name: string };
  round: { id: number; label: string; status: string };
  gradersPerApplication: number;
  load: LoadSummary | null;
  graders: AssignmentReviewGrader[];
}

interface LoadedAssignment extends LiveAssignment {
  rowIndex: number;
  candidateName: string;
  candidateEmail: string;
  graderName: string;
  graderEmail: string;
}

interface PoolUser {
  id: number;
  name: string;
  email: string;
}

async function listTeamGradingPool(
  teamId: number,
  roundId: number,
): Promise<PoolUser[]> {
  const db = getDb();
  const execRoles = EXEC_ROLE_SQL_VALUES.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT DISTINCT u.id, u.name, u.email
          FROM users u
          JOIN access_grants ag ON ag.user_id = u.id AND ag.revoked_at IS NULL
          WHERE ag.team_id = ?
            AND (ag.round_id IS NULL OR ag.round_id = ?)
            AND u.role IN (${execRoles}, 'ad_hoc_exec')
            AND (
              u.role IN (${execRoles})
              OR ag.stage IS NULL
              OR ag.stage = 'application'
            )
          ORDER BY u.name COLLATE NOCASE ASC`,
    args: [teamId, roundId, ...EXEC_ROLE_SQL_VALUES, ...EXEC_ROLE_SQL_VALUES],
  });
  return result.rows.map((row) => ({
    id: row.id as number,
    name: (row.name as string) || '',
    email: (row.email as string) || '',
  }));
}

async function loadLiveAssignments(teamId: number): Promise<{
  team: { id: number; name: string };
  round: { id: number; label: string; status: string };
  gradersPerApplication: number;
  rows: LoadedAssignment[];
  pool: PoolUser[];
}> {
  const team = await getTeamById(teamId);
  if (!team) {
    throw new Error('Team not found');
  }

  const round = await getActiveRoundForTeam(teamId);
  if (!round) {
    throw new Error('No active round for this team.');
  }

  const settings = await getRoundSettings(round.id);
  const db = getDb();
  const [result, pool] = await Promise.all([
    db.execute({
      sql: `SELECT a.id AS assignment_id,
                 a.user_id,
                 a.status,
                 app.id AS application_id,
                 app.row_index,
                 c.name AS candidate_name,
                 c.email AS candidate_email,
                 u.name AS grader_name,
                 u.email AS grader_email,
                 (SELECT COUNT(*) FROM scores s
                  WHERE s.assignment_id = a.id AND s.score IS NOT NULL) AS score_count
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN candidates c ON c.id = app.candidate_id
          JOIN users u ON u.id = a.user_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'
          ORDER BY u.name ASC, app.row_index ASC`,
      args: [teamId, round.id],
    }),
    listTeamGradingPool(teamId, round.id),
  ]);

  const rows: LoadedAssignment[] = result.rows.map((row) => ({
    assignmentId: row.assignment_id as number,
    applicationId: row.application_id as number,
    userId: row.user_id as number,
    status: (row.status as AssignmentWorkStatus) ?? 'pending',
    hasScores: Number(row.score_count) > 0,
    rowIndex: (row.row_index as number | null) ?? 0,
    candidateName: (row.candidate_name as string) || 'Unknown',
    candidateEmail: (row.candidate_email as string) || '',
    graderName: (row.grader_name as string) || '',
    graderEmail: (row.grader_email as string) || '',
  }));

  return {
    team: { id: team.id, name: team.name },
    round: { id: round.id, label: round.label, status: round.status },
    gradersPerApplication:
      settings?.graders_per_application ?? DEFAULT_GRADERS_PER_APPLICATION,
    rows,
    pool,
  };
}

function toReviewState(loaded: {
  team: { id: number; name: string };
  round: { id: number; label: string; status: string };
  gradersPerApplication: number;
  rows: LoadedAssignment[];
  pool: PoolUser[];
}): AssignmentReviewState {
  const graderMap = new Map<number, AssignmentReviewGrader>();

  for (const row of loaded.rows) {
    let grader = graderMap.get(row.userId);
    if (!grader) {
      grader = {
        id: row.userId,
        name: row.graderName,
        email: row.graderEmail,
        total: 0,
        completed: 0,
        movable: 0,
        assignments: [],
      };
      graderMap.set(row.userId, grader);
    }

    grader.total += 1;
    if (row.status === 'completed') grader.completed += 1;
    if (row.status === 'pending' && !row.hasScores) grader.movable += 1;
    grader.assignments.push({
      assignmentId: row.assignmentId,
      applicationId: row.applicationId,
      rowIndex: row.rowIndex,
      applicantNumber: displayApplicantId(row.rowIndex),
      candidateName: row.candidateName,
      candidateEmail: row.candidateEmail,
      status: row.status,
      hasScores: row.hasScores,
    });
  }

  for (const user of loaded.pool) {
    if (graderMap.has(user.id)) continue;
    graderMap.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      total: 0,
      completed: 0,
      movable: 0,
      assignments: [],
    });
  }

  const graders = [...graderMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );

  const assignedCounts = graders.filter((g) => g.total > 0).map((g) => g.total);

  return {
    team: loaded.team,
    round: loaded.round,
    gradersPerApplication: loaded.gradersPerApplication,
    load: loadSummary(assignedCounts),
    graders,
  };
}

export async function getAssignmentReviewState(teamId: number): Promise<AssignmentReviewState> {
  return toReviewState(await loadLiveAssignments(teamId));
}

export async function applyAssignmentMoves(moves: AssignmentMove[]): Promise<void> {
  if (moves.length === 0) return;
  const db = getDb();
  await db.batch(
    moves.flatMap((move) => [
      { sql: 'DELETE FROM assignments WHERE id = ?', args: [move.assignmentId] },
      {
        sql: `INSERT INTO assignments (application_id, user_id, stage) VALUES (?, ?, 'application')`,
        args: [move.applicationId, move.toUserId],
      },
    ]),
    'write',
  );
}

export async function reassignApplicationAssignment(
  teamId: number,
  assignmentId: number,
  newUserId: number,
): Promise<{ newGraderName: string }> {
  const loaded = await loadLiveAssignments(teamId);
  const assignment = loaded.rows.find((row) => row.assignmentId === assignmentId);
  if (!assignment) {
    throw new Error('Assignment not found');
  }
  if (assignment.status === 'completed') {
    throw new Error('Cannot reassign a completed assignment');
  }
  if (assignment.userId === newUserId) {
    throw new Error('Choose a different grader.');
  }

  const poolIds = new Set([
    ...loaded.rows.map((row) => row.userId),
    ...loaded.pool.map((user) => user.id),
  ]);
  if (!poolIds.has(newUserId)) {
    throw new Error('Selected grader is not on this team’s grading pool.');
  }

  const alreadyAssigned = loaded.rows.some(
    (row) => row.applicationId === assignment.applicationId && row.userId === newUserId,
  );
  if (alreadyAssigned) {
    throw new Error('That grader is already assigned to this application.');
  }

  await applyAssignmentMoves([
    {
      assignmentId,
      applicationId: assignment.applicationId,
      fromUserId: assignment.userId,
      toUserId: newUserId,
    },
  ]);

  const db = getDb();
  const nameResult = await db.execute({
    sql: 'SELECT name FROM users WHERE id = ?',
    args: [newUserId],
  });
  return { newGraderName: (nameResult.rows[0]?.name as string) ?? '' };
}

export async function rebalanceTeamAssignments(teamId: number): Promise<{ moved: number }> {
  const loaded = await loadLiveAssignments(teamId);
  const moves = planRebalance(loaded.rows);
  await applyAssignmentMoves(moves);
  return { moved: moves.length };
}

export async function setGraderAssignmentLoad(
  teamId: number,
  userId: number,
  target: number,
): Promise<{ moved: number }> {
  const loaded = await loadLiveAssignments(teamId);
  const moves = planSetLoad(loaded.rows, userId, target);
  await applyAssignmentMoves(moves);
  return { moved: moves.length };
}

export async function moveRemainingAssignments(
  teamId: number,
  fromUserId: number,
  toUserIds: number[],
  count: number,
  includeInProgress: boolean,
): Promise<{ moved: number }> {
  const loaded = await loadLiveAssignments(teamId);
  const poolIds = new Set([
    ...loaded.rows.map((row) => row.userId),
    ...loaded.pool.map((user) => user.id),
  ]);
  if (!poolIds.has(fromUserId)) {
    throw new Error('That grader is not on this team’s grading pool.');
  }
  for (const toUserId of toUserIds) {
    if (!poolIds.has(toUserId)) {
      throw new Error('One of the selected people is not on this team’s grading pool.');
    }
  }
  const moves = planMoveRemaining(
    loaded.rows,
    fromUserId,
    toUserIds,
    count,
    includeInProgress,
  );
  await applyAssignmentMoves(moves);
  return { moved: moves.length };
}
