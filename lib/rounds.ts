import { cache } from 'react';
import {
  getDb,
  getRoundById,
  getTeamById,
  getUserByEmail,
  rowToRound,
  type ResultSet,
  type Round,
  type Team,
} from '@/lib/db';
import { assignGraders, DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import { extractCandidateFromFields } from '@/lib/candidates';
import { parseCsv } from '@/lib/csv';
import { getOrgCoffeeChatDates } from '@/lib/org-coffee-chat-dates';
import { cachedPerRequest } from '@/lib/request-cache';
import { getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';
import { getOrgRubric, mergeOrgRubricIntoHeaders } from '@/lib/org-rubric';

export interface NormalizationFactor {
  userId: number;
  graderName: string;
  rawMean: number;
  adjustment: number;
}

export interface RoundSettings {
  round_id: number;
  csv_headers: string[];
  score_fields: string[];
  custom_score_fields: string[];
  context_fields: string[];
  grader_instructions: string | null;
  interview_script_first_round: string | null;
  interview_guides: string | null;
  normalization_factors: NormalizationFactor[] | null;
  graders_per_application: number;
  coffee_chat_start_date: string | null;
  application_due_date: string | null;
}

interface GraderInput {
  name: string;
  email: string;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return JSON.parse(value) as string[];
}

function parseNormalizationFactors(value: unknown): NormalizationFactor[] | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return JSON.parse(value) as NormalizationFactor[];
}

export function rowToRoundSettings(row: ResultSet['rows'][number]): RoundSettings {
  return {
    round_id: row.round_id as number,
    csv_headers: parseJsonArray(row.csv_headers),
    score_fields: parseJsonArray(row.score_fields),
    custom_score_fields: parseJsonArray(row.custom_score_fields),
    context_fields: parseJsonArray(row.context_fields),
    grader_instructions: (row.grader_instructions as string | null) ?? null,
    interview_script_first_round: (row.interview_script_first_round as string | null) ?? null,
    interview_guides: (row.interview_guides as string | null) ?? null,
    normalization_factors: parseNormalizationFactors(row.normalization_factors),
    graders_per_application:
      typeof row.graders_per_application === 'number'
        ? row.graders_per_application
        : DEFAULT_GRADERS_PER_APPLICATION,
    coffee_chat_start_date: (row.coffee_chat_start_date as string | null) ?? null,
    application_due_date: (row.application_due_date as string | null) ?? null,
  };
}

export async function updateRoundCoffeeChatDates(
  roundId: number,
  dates: { coffeeChatStartDate: string | null; applicationDueDate: string | null },
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE round_settings
          SET coffee_chat_start_date = ?, application_due_date = ?
          WHERE round_id = ?`,
    args: [dates.coffeeChatStartDate, dates.applicationDueDate, roundId],
  });
}

export async function getRoundSettings(roundId: number): Promise<RoundSettings | null> {
  return cachedPerRequest(`roundSettings:${roundId}`, async () => {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM round_settings WHERE round_id = ?',
      args: [roundId],
    });
    if (result.rows.length === 0) return null;
    return rowToRoundSettings(result.rows[0]);
  });
}

/**
 * Current pipeline round for a team.
 * Prefers a non-closed round (most advanced stage wins). When the cycle is
 * closed, falls back to the latest closed round so archive viewing still works.
 */
export async function getActiveRoundForTeam(teamId: number): Promise<Round | null> {
  return cachedPerRequest(`activeRound:${teamId}`, () => getActiveRoundForTeamUncached(teamId));
}

async function getActiveRoundForTeamUncached(teamId: number): Promise<Round | null> {
  const db = getDb();
  const active = await db.execute({
    sql: `SELECT * FROM rounds
          WHERE team_id = ? AND status != 'closed'
          ORDER BY
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
          LIMIT 1`,
    args: [teamId],
  });
  if (active.rows.length > 0) return rowToRound(active.rows[0]);

  const closed = await db.execute({
    sql: `SELECT * FROM rounds
          WHERE team_id = ? AND status = 'closed'
          ORDER BY created_at DESC
          LIMIT 1`,
    args: [teamId],
  });
  if (closed.rows.length === 0) return null;
  return rowToRound(closed.rows[0]);
}

export async function teamHasApplicationPipeline(teamId: number): Promise<boolean> {
  const round = await getActiveRoundForTeam(teamId);
  if (!round) return false;
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM applications WHERE team_id = ? AND round_id = ?',
    args: [teamId, round.id],
  });
  return ((result.rows[0]?.count as number) ?? 0) > 0;
}

/**
 * True when any team has imported applications for its active round.
 * Single EXISTS query (matches getActiveRoundForTeam: prefer non-closed, else latest closed).
 * React-cached so layouts share one result per RSC request.
 */
export const anyTeamHasActivePipeline = cache(async function anyTeamHasActivePipeline(): Promise<boolean> {
  return cachedPerRequest('anyTeamHasActivePipeline', async () => {
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT EXISTS (
              SELECT 1
              FROM teams t
              WHERE EXISTS (
                SELECT 1
                FROM applications app
                WHERE app.team_id = t.id
                  AND app.round_id = COALESCE(
                    (
                      SELECT r.id FROM rounds r
                      WHERE r.team_id = t.id AND r.status != 'closed'
                      ORDER BY
                        CASE r.status
                          WHEN 'deliberations' THEN 6
                          WHEN 'final_round' THEN 5
                          WHEN 'first_round' THEN 4
                          WHEN 'application' THEN 3
                          WHEN 'pre_application' THEN 2
                          WHEN 'setup' THEN 1
                          ELSE 0
                        END DESC,
                        r.created_at DESC
                      LIMIT 1
                    ),
                    (
                      SELECT r.id FROM rounds r
                      WHERE r.team_id = t.id AND r.status = 'closed'
                      ORDER BY r.created_at DESC
                      LIMIT 1
                    )
                  )
              )
            ) AS has_pipeline`,
    });
    return Boolean(result.rows[0]?.has_pipeline);
  });
});

export interface ImportRoundInput {
  teamId: number;
  roundLabel: string;
  csvText: string;
  scoreFields: string[];
  customScoreFields: string[];
  graderInputs: GraderInput[];
  graderInstructions?: string;
  gradersPerApplication?: number;
}

export interface ImportRoundResult {
  team: Team;
  round: Round;
  applicationCount: number;
  graderCount: number;
}

export async function importApplicationRound(input: ImportRoundInput): Promise<ImportRoundResult> {
  const team = await getTeamById(input.teamId);
  if (!team) throw new Error('Team not found.');

  const existing = await getActiveRoundForTeam(input.teamId);
  if (existing) {
    const settings = await getRoundSettings(existing.id);
    if (settings) {
      throw new Error(`This team already has an active round (${existing.label}).`);
    }
  }

  const parsed = parseCsv(input.csvText);
  const orgRubric = await getOrgRubric();
  let scoreFields = input.scoreFields.filter((f) => parsed.headers.includes(f));
  let customScoreFields = input.customScoreFields.map((f) => f.trim()).filter(Boolean);
  let graderInstructions = input.graderInstructions?.trim() || null;

  if (orgRubric) {
    const merged = mergeOrgRubricIntoHeaders(orgRubric, parsed.headers);
    if (merged.score_fields.length > 0) scoreFields = merged.score_fields;
    if (merged.custom_score_fields.length > 0) customScoreFields = merged.custom_score_fields;
    if (merged.grader_instructions) graderInstructions = merged.grader_instructions;
  }

  if (scoreFields.length === 0) {
    throw new Error('At least one scored column must be selected.');
  }

  const gradersPerApplication = input.gradersPerApplication ?? DEFAULT_GRADERS_PER_APPLICATION;

  if (input.graderInputs.length < gradersPerApplication) {
    throw new Error(`At least ${gradersPerApplication} graders are required.`);
  }

  const db = getDb();
  const graderUsers: { id: number; name: string; email: string }[] = [];

  for (const g of input.graderInputs) {
    const email = g.email.trim().toLowerCase();
    const user = await getUserByEmail(email);
    if (!user) {
      throw new Error(`No user found for ${email}. Add them before importing.`);
    }
    graderUsers.push({ id: user.id, name: user.name, email: user.email });
  }

  const roundLabel = input.roundLabel.trim() || (await getRecruitmentCycleShortLabel());

  const roundResult = await db.execute({
    sql: `INSERT INTO rounds (team_id, label, status) VALUES (?, ?, 'application')`,
    args: [input.teamId, roundLabel],
  });
  const roundId = Number(roundResult.lastInsertRowid);
  const round = await getRoundById(roundId);
  if (!round) throw new Error('Failed to create round.');

  const orgDates = await getOrgCoffeeChatDates();

  await db.execute({
    sql: `INSERT INTO round_settings (
            round_id, csv_headers, score_fields, custom_score_fields, grader_instructions,
            context_fields, graders_per_application, coffee_chat_start_date, application_due_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      roundId,
      JSON.stringify(parsed.headers),
      JSON.stringify(scoreFields),
      JSON.stringify(customScoreFields),
      input.graderInstructions?.trim() || null,
      '[]',
      gradersPerApplication,
      orgDates.coffeeChatStartDate,
      orgDates.applicationDueDate,
    ],
  });

  const appIds: number[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const { name, email } = extractCandidateFromFields(row);

    let candidateId: number;
    const existingCandidate = await db.execute({
      sql: 'SELECT id FROM candidates WHERE email = ?',
      args: [email],
    });

    if (existingCandidate.rows.length > 0) {
      candidateId = existingCandidate.rows[0].id as number;
    } else {
      const candidateResult = await db.execute({
        sql: 'INSERT INTO candidates (name, email) VALUES (?, ?)',
        args: [name, email],
      });
      candidateId = Number(candidateResult.lastInsertRowid);
    }

    const appResult = await db.execute({
      sql: `INSERT INTO applications (candidate_id, round_id, team_id, fields, stage, row_index)
            VALUES (?, ?, ?, ?, 'application', ?)`,
      args: [candidateId, roundId, input.teamId, JSON.stringify(row), i + 1],
    });
    appIds.push(Number(appResult.lastInsertRowid));
  }

  const assignments = assignGraders(
    appIds,
    graderUsers.map((g) => g.id),
    gradersPerApplication,
  );

  for (const a of assignments) {
    await db.execute({
      sql: `INSERT INTO assignments (application_id, user_id, stage) VALUES (?, ?, 'application')`,
      args: [a.applicationId, a.userId],
    });
  }

  return {
    team,
    round,
    applicationCount: appIds.length,
    graderCount: graderUsers.length,
  };
}

export async function getTeamRoundStats(teamId: number, roundId: number) {
  const db = getDb();
  const settings = await getRoundSettings(roundId);
  const apps = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM applications WHERE team_id = ? AND round_id = ?',
    args: [teamId, roundId],
  });
  const progress = await db.execute({
    sql: `SELECT COUNT(*) as total,
                 SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'`,
    args: [teamId, roundId],
  });

  return {
    applicationCount: apps.rows[0].count as number,
    assignmentProgress: {
      total: progress.rows[0].total as number,
      completed: progress.rows[0].completed as number,
    },
    gradersPerApplication: settings?.graders_per_application ?? DEFAULT_GRADERS_PER_APPLICATION,
  };
}

export interface RoundRubricInput {
  scoreFields: string[];
  customScoreFields: string[];
  contextFields: string[];
  graderInstructions?: string | null;
}

export async function updateRoundRubric(
  roundId: number,
  teamId: number,
  input: RoundRubricInput,
): Promise<RoundSettings> {
  const settings = await getRoundSettings(roundId);
  if (!settings) throw new Error('Round settings not found.');

  const scoreFields = input.scoreFields.filter((f) => settings.csv_headers.includes(f));
  if (scoreFields.length === 0) {
    throw new Error('At least one CSV column must be scored.');
  }

  const customScoreFields = input.customScoreFields.map((f) => f.trim()).filter(Boolean);
  const scored = new Set([...scoreFields, ...customScoreFields]);
  const contextFields = input.contextFields.filter(
    (f) => settings.csv_headers.includes(f) && !scored.has(f),
  );

  const db = getDb();
  await db.execute({
    sql: `UPDATE round_settings
          SET score_fields = ?, custom_score_fields = ?, context_fields = ?, grader_instructions = ?
          WHERE round_id = ?`,
    args: [
      JSON.stringify(scoreFields),
      JSON.stringify(customScoreFields),
      JSON.stringify(contextFields),
      input.graderInstructions?.trim() || null,
      roundId,
    ],
  });

  const round = await db.execute({
    sql: 'SELECT team_id FROM rounds WHERE id = ?',
    args: [roundId],
  });
  if (round.rows.length === 0 || (round.rows[0].team_id as number) !== teamId) {
    throw new Error('Round does not belong to this team.');
  }

  const updated = await getRoundSettings(roundId);
  if (!updated) throw new Error('Failed to load updated settings.');
  return updated;
}
