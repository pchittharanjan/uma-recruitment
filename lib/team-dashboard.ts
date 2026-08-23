import {
  filterFieldsForBlindReview,
  filterPortfolioFieldsForBlindReview,
  resolveContextFields,
} from '@/lib/blind';
import { getDb, type AssignmentStage, type User } from '@/lib/db';
import {
  getRoundSettings,
  type NormalizationFactor,
  type RoundSettings,
} from '@/lib/rounds';

export interface TeamDashboardData {
  teamId: number;
  roundId: number;
  roundLabel: string;
  status: string;
  progress: { total: number; completed: number };
  graders: Array<{
    id: number;
    name: string;
    email: string;
    total: number;
    completed: number;
  }>;
  applications: Array<{
    id: number;
    rowIndex: number;
    fields: Record<string, string>;
    adminNote: string | null;
    finalScore: number | null;
    rank: number | null;
    assignments: Array<{
      assignmentId: number;
      userId: number;
      graderName: string;
      status: string;
      scores: Record<string, number>;
      total: number | null;
      comment: string | null;
    }>;
    average: number | null;
  }>;
  scoreFields: string[];
  csvHeaders: string[];
  customScoreFields: string[];
  normalizationFactors: NormalizationFactor[] | null;
}

export async function buildTeamDashboard(
  teamId: number,
  roundId: number,
  options: { blind: boolean },
): Promise<TeamDashboardData | null> {
  const settings = await getRoundSettings(roundId);
  if (!settings) return null;

  const db = getDb();

  const roundResult = await db.execute({
    sql: 'SELECT label, status FROM rounds WHERE id = ? AND team_id = ?',
    args: [roundId, teamId],
  });
  if (roundResult.rows.length === 0) return null;
  const roundLabel = roundResult.rows[0].label as string;
  const status = roundResult.rows[0].status as string;

  const gradersResult = await db.execute({
    sql: `SELECT u.id, u.name, u.email,
                 COUNT(a.id) as total,
                 SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM users u
          JOIN assignments a ON a.user_id = u.id
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'
          GROUP BY u.id
          ORDER BY u.name ASC`,
    args: [teamId, roundId],
  });

  const graders = gradersResult.rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    email: r.email as string,
    total: r.total as number,
    completed: r.completed as number,
  }));

  const progressResult = await db.execute({
    sql: `SELECT COUNT(*) as total,
                 SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'`,
    args: [teamId, roundId],
  });

  const progress = {
    total: progressResult.rows[0].total as number,
    completed: progressResult.rows[0].completed as number,
  };

  const appsResult = await db.execute({
    sql: `SELECT app.id, app.row_index, app.fields, app.admin_note, app.final_score, app.rank,
                 asgn.id as assignment_id, asgn.user_id, asgn.status as asgn_status, asgn.comment as asgn_comment,
                 u.name as grader_name
          FROM applications app
          LEFT JOIN assignments asgn ON asgn.application_id = app.id AND asgn.stage = 'application'
          LEFT JOIN users u ON u.id = asgn.user_id
          WHERE app.team_id = ? AND app.round_id = ?
          ORDER BY app.row_index ASC, asgn.id ASC`,
    args: [teamId, roundId],
  });

  const scoresResult = await db.execute({
    sql: `SELECT s.assignment_id, s.field_name, s.score
          FROM scores s
          JOIN assignments asgn ON asgn.id = s.assignment_id
          JOIN applications app ON app.id = asgn.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND asgn.stage = 'application'`,
    args: [teamId, roundId],
  });

  const scoresByAssignment: Record<number, Record<string, number>> = {};
  for (const row of scoresResult.rows) {
    const aid = row.assignment_id as number;
    if (!scoresByAssignment[aid]) scoresByAssignment[aid] = {};
    scoresByAssignment[aid][row.field_name as string] = row.score as number;
  }

  const appMap = new Map<number, TeamDashboardData['applications'][number]>();

  for (const row of appsResult.rows) {
    const appId = row.id as number;
    if (!appMap.has(appId)) {
      const rawFields = JSON.parse(row.fields as string) as Record<string, string>;
      const allScoreFields = [...settings.score_fields, ...settings.custom_score_fields];
      appMap.set(appId, {
        id: appId,
        rowIndex: (row.row_index as number | null) ?? 0,
        fields: options.blind
          ? filterFieldsForBlindReview(
              rawFields,
              allScoreFields,
              resolveContextFields(settings),
            )
          : rawFields,
        adminNote: options.blind ? null : (row.admin_note as string | null) ?? null,
        finalScore: row.final_score as number | null,
        rank: row.rank as number | null,
        assignments: [],
        average: null,
      });
    }

    if (row.assignment_id !== null) {
      const assignmentId = row.assignment_id as number;
      const scores = scoresByAssignment[assignmentId] ?? {};
      const scoreValues = Object.values(scores);
      const total = scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) : null;

      appMap.get(appId)!.assignments.push({
        assignmentId,
        userId: row.user_id as number,
        graderName: row.grader_name as string,
        status: row.asgn_status as string,
        scores,
        total,
        comment: options.blind ? null : (row.asgn_comment as string | null) ?? null,
      });
    }
  }

  const scoreFieldCount =
    settings.score_fields.length + settings.custom_score_fields.length;
  const applications = Array.from(appMap.values()).map((app) => {
    const allScores = app.assignments.flatMap((a) => Object.values(a.scores));
    // Mean of field scores (1–5); require every assigned grader to have scored all fields
    const gradersWithFullScores = app.assignments.filter(
      (a) => Object.keys(a.scores).length === scoreFieldCount,
    ).length;
    const average =
      scoreFieldCount > 0 &&
      app.assignments.length > 0 &&
      gradersWithFullScores === app.assignments.length
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : null;
    return { ...app, average };
  });

  return {
    teamId,
    roundId,
    roundLabel,
    status,
    progress,
    graders,
    applications,
    scoreFields: settings.score_fields,
    csvHeaders: settings.csv_headers,
    customScoreFields: settings.custom_score_fields,
    normalizationFactors: settings.normalization_factors,
  };
}

export interface RankedApplication {
  id: number;
  rowIndex: number;
  fields: Record<string, string>;
  /** Leniency-adjusted mean of field scores — used for ranking. */
  average: number;
  /** Unadjusted mean of the same field scores (no leniency). */
  rawAverage: number;
  rank: number;
}

export async function computeNormalizedRankings(
  teamId: number,
  roundId: number,
): Promise<{
  ranked: RankedApplication[];
  normalizationFactors: NormalizationFactor[];
  incompleteCount: number;
}> {
  const settings = await getRoundSettings(roundId);
  if (!settings) throw new Error('Round not configured.');

  const db = getDb();

  const incomplete = await db.execute({
    sql: `SELECT COUNT(*) as count FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application' AND a.status = 'pending'`,
    args: [teamId, roundId],
  });
  const incompleteCount = incomplete.rows[0].count as number;

  const allScoresResult = await db.execute({
    sql: `SELECT s.score, a.user_id, a.application_id
          FROM scores s
          JOIN assignments a ON a.id = s.assignment_id
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'`,
    args: [teamId, roundId],
  });

  const allScoreValues = allScoresResult.rows.map((r) => r.score as number);
  const globalMean =
    allScoreValues.length > 0
      ? allScoreValues.reduce((a, b) => a + b, 0) / allScoreValues.length
      : 3;

  const userScoreBuckets: Record<number, number[]> = {};
  const scoresByApp = new Map<number, Array<{ score: number; userId: number }>>();
  for (const row of allScoresResult.rows) {
    const uid = row.user_id as number;
    const appId = row.application_id as number;
    const score = row.score as number;
    if (!userScoreBuckets[uid]) userScoreBuckets[uid] = [];
    userScoreBuckets[uid].push(score);
    const bucket = scoresByApp.get(appId) ?? [];
    bucket.push({ score, userId: uid });
    scoresByApp.set(appId, bucket);
  }

  const userMeans: Record<number, number> = {};
  for (const [uid, scores] of Object.entries(userScoreBuckets)) {
    userMeans[Number(uid)] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const usersResult = await db.execute({
    sql: `SELECT DISTINCT u.id, u.name FROM users u
          JOIN assignments a ON a.user_id = u.id
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ?`,
    args: [teamId, roundId],
  });
  const userNames: Record<number, string> = {};
  for (const row of usersResult.rows) {
    userNames[row.id as number] = row.name as string;
  }

  const normalizationFactors: NormalizationFactor[] = Object.entries(userMeans).map(
    ([uid, mean]) => ({
      userId: Number(uid),
      graderName: userNames[Number(uid)] ?? `Grader ${uid}`,
      rawMean: Math.round(mean * 100) / 100,
      adjustment: Math.round((globalMean - mean) * 100) / 100,
    }),
  );

  const appsResult = await db.execute({
    sql: 'SELECT id, row_index, fields FROM applications WHERE team_id = ? AND round_id = ? ORDER BY id ASC',
    args: [teamId, roundId],
  });

  const scored: Array<{
    id: number;
    rowIndex: number;
    fields: Record<string, string>;
    average: number;
    rawAverage: number;
  }> = [];

  for (const appRow of appsResult.rows) {
    const appId = appRow.id as number;
    const appScores = scoresByApp.get(appId) ?? [];

    const rawScores = appScores.map((row) => row.score);
    const adjustedScores = appScores.map((row) => {
      const adjustment = globalMean - (userMeans[row.userId] ?? globalMean);
      return Math.min(5, Math.max(1, row.score + adjustment));
    });

    // Mean of leniency-adjusted field scores (1–5); denominator = this app's actual score count
    const average =
      adjustedScores.length > 0
        ? adjustedScores.reduce((a, b) => a + b, 0) / adjustedScores.length
        : 0;
    // Same rows, no leniency adjustment
    const rawAverage =
      rawScores.length > 0
        ? rawScores.reduce((a, b) => a + b, 0) / rawScores.length
        : 0;

    scored.push({
      id: appId,
      rowIndex: (appRow.row_index as number | null) ?? 0,
      fields: JSON.parse(appRow.fields as string) as Record<string, string>,
      average,
      rawAverage,
    });
  }

  scored.sort((a, b) => b.average - a.average);

  let currentRank = 1;
  const ranked: RankedApplication[] = [];
  for (let i = 0; i < scored.length; i++) {
    if (i > 0 && scored[i].average !== scored[i - 1].average) {
      currentRank = i + 1;
    }
    ranked.push({
      id: scored[i].id,
      rowIndex: scored[i].rowIndex,
      fields: scored[i].fields,
      average: scored[i].average,
      rawAverage: scored[i].rawAverage,
      rank: currentRank,
    });
  }

  return { ranked, normalizationFactors, incompleteCount };
}

export async function applyAdvancementSelection(
  teamId: number,
  roundId: number,
  advancedApplicationIds: number[],
): Promise<void> {
  const { ranked, normalizationFactors } = await computeNormalizedRankings(teamId, roundId);
  const advancedSet = new Set(advancedApplicationIds);
  const db = getDb();

  for (const app of ranked) {
    const stage = advancedSet.has(app.id) ? 'first_round' : 'rejected';
    const rejectedFrom = stage === 'rejected' ? 'application' : null;
    await db.execute({
      sql: `UPDATE applications
            SET final_score = ?, rank = ?, stage = ?, rejected_from_stage = ?
            WHERE id = ? AND team_id = ?`,
      args: [app.average, app.rank, stage, rejectedFrom, app.id, teamId],
    });
  }

  await db.execute({
    sql: `UPDATE round_settings SET normalization_factors = ? WHERE round_id = ?`,
    args: [JSON.stringify(normalizationFactors), roundId],
  });
}

export async function finalizeTeamRound(
  teamId: number,
  roundId: number,
  options: { topN: number; force: boolean },
): Promise<{ incompleteCount?: number }> {
  const { ranked, incompleteCount } = await computeNormalizedRankings(teamId, roundId);
  if (incompleteCount > 0 && !options.force) {
    return { incompleteCount };
  }

  const advancedIds = ranked.slice(0, options.topN).map((app) => app.id);
  await applyAdvancementSelection(teamId, roundId, advancedIds);
  return {};
}

export function userSeesBlindApplications(user: User): boolean {
  return user.role === 'exec' || user.role === 'ad_hoc_exec';
}

export async function getGraderAssignmentForUser(
  userId: number,
  applicationId: number,
  teamId: number,
  stage: AssignmentStage = 'application',
) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT a.id, a.comment, a.status, a.stage, app.id as application_id, app.row_index, app.fields, app.team_id, app.round_id,
                 c.name as candidate_name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN candidates c ON c.id = app.candidate_id
          WHERE a.user_id = ? AND a.application_id = ? AND app.team_id = ? AND a.stage = ?`,
    args: [userId, applicationId, teamId, stage],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    assignmentId: row.id as number,
    comment: (row.comment as string | null) ?? '',
    status: row.status as string,
    stage: row.stage as AssignmentStage,
    applicationId: row.application_id as number,
    rowIndex: (row.row_index as number | null) ?? 0,
    candidateName: row.candidate_name as string,
    fields: JSON.parse(row.fields as string) as Record<string, string>,
    teamId: row.team_id as number,
    roundId: row.round_id as number,
  };
}

export async function getTeamStageProgress(
  teamId: number,
  roundId: number,
  stage: AssignmentStage,
): Promise<{ completed: number; total: number }> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) as total,
                 SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ?`,
    args: [teamId, roundId, stage],
  });
  return {
    total: (result.rows[0].total as number) ?? 0,
    completed: (result.rows[0].completed as number) ?? 0,
  };
}

export async function listGraderAssignments(
  userId: number,
  teamId: number,
  stage: AssignmentStage = 'application',
) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT a.id as assignment_id, a.status, app.id as application_id, app.row_index,
                 c.name as candidate_name,
                 islot.scheduled_at, islot.location, islot.logistics_note, islot.group_key
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN candidates c ON c.id = app.candidate_id
          LEFT JOIN interview_slots islot ON islot.application_id = app.id AND islot.stage = a.stage
          WHERE a.user_id = ? AND app.team_id = ? AND a.stage = ?
          ORDER BY islot.scheduled_at ASC, app.row_index ASC`,
    args: [userId, teamId, stage],
  });
  return result.rows.map((r) => ({
    assignmentId: r.assignment_id as number,
    applicationId: r.application_id as number,
    rowIndex: (r.row_index as number | null) ?? 0,
    candidateName: r.candidate_name as string,
    status: r.status as string,
    scheduledAt: (r.scheduled_at as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    logisticsNote: (r.logistics_note as string | null) ?? null,
    groupKey: (r.group_key as string | null) ?? null,
  }));
}

export function serializeApplicationFields(
  fields: Record<string, string>,
  settings: RoundSettings,
  blind: boolean,
): Record<string, string> {
  if (!blind) return fields;
  const allScoreFields = [...settings.score_fields, ...settings.custom_score_fields];
  return filterFieldsForBlindReview(fields, allScoreFields, settings.portfolio_fields ?? []);
}

export function serializePortfolioFields(
  fields: Record<string, string>,
  settings: RoundSettings,
  blind: boolean,
): Record<string, string> {
  const portfolioFields = settings.portfolio_fields ?? [];
  if (!blind) {
    return Object.fromEntries(
      portfolioFields.filter((k) => k in fields).map((k) => [k, fields[k]]),
    );
  }
  return filterPortfolioFieldsForBlindReview(fields, portfolioFields);
}

export function graderContextFieldsForSettings(_settings: RoundSettings): string[] {
  return [];
}
