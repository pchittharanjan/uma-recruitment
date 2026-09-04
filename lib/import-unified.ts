import {
  getDb,
  getTeamByName,
  getUserByEmail,
  type Team,
  type TeamName,
} from '@/lib/db';
import { assignGraders, DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import {
  extractCandidateFromFields,
  findDuplicateCandidateEmails,
  formatDuplicateCandidateEmailError,
  isApplicationsUniqueConstraintError,
} from '@/lib/candidates';
import { parseCsv, type ParsedCsv } from '@/lib/csv';
import { isTestGraderEmail, type GraderInput } from '@/lib/grader-parse';
import { seedDefaultUnlocksForRound } from '@/lib/stage-access';
import { applyGlobalPipelineToRound } from '@/lib/pipeline-phase';
import {
  getActiveRoundForTeam,
  getRoundSettings,
  type ImportRoundResult,
} from '@/lib/rounds';
import { getRoundById } from '@/lib/db';
import { getOrgCoffeeChatDates } from '@/lib/org-coffee-chat-dates';
import { getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';
import { createUser } from '@/lib/users-admin';
import {
  splitRowsByTeam,
  type SplitRow,
  type TeamSplitConfig,
  TEAM_NAMES,
} from '@/lib/team-split';
import {
  buildFall2026RoundRubric,
  FALL_2026_GRADER_INSTRUCTIONS,
  findMatchingHeader,
} from '@/lib/fall-2026-grading-model';
import {
  applicationCriterionKeys,
  applicationCsvFields,
  portfolioCsvField,
} from '@/lib/grading-model';
import type { TeamGradingModel } from '@/lib/grading-model-types';

export interface UnifiedImportInput {
  roundLabel: string;
  /** Raw CSV text — used when `spreadsheet` is not provided. */
  csvText?: string;
  /** Pre-parsed sheet (CSV / Excel / ODS). Preferred when available. */
  spreadsheet?: ParsedCsv;
  scoreFieldsByTeam: Partial<Record<TeamName, string[]>>;
  portfolioFieldsByTeam?: Partial<Record<TeamName, string[]>>;
  /**
   * Optional per-team grading models from the import Criteria step.
   * When present for a team, that model is persisted and used to derive
   * score/custom/portfolio fields — Fall 2026 disk auto is not applied.
   */
  gradingModelByTeam?: Partial<Record<TeamName, TeamGradingModel>>;
  contextFields: string[];
  customScoreFields: string[];
  teamSplitConfig: TeamSplitConfig;
  gradersByTeam: Partial<Record<TeamName, GraderInput[]>>;
  graderInstructions?: string;
  gradersPerApplication?: number;
  invitedByUserId: number;
  onProgress?: (event: ImportProgressEvent) => void;
}

/** Derive round score/portfolio fields from a client-edited grading model. */
function resolveFieldsFromGradingModel(
  model: TeamGradingModel,
  csvHeaders: string[],
  clientScoreFields: string[],
  clientPortfolioFields: string[],
): {
  scoreFields: string[];
  customScoreFields: string[];
  portfolioFields: string[];
} {
  const headerSet = new Set(csvHeaders);
  const portfolioExpected = portfolioCsvField(model);
  const portfolioMatched = portfolioExpected
    ? findMatchingHeader(portfolioExpected, csvHeaders)
    : undefined;

  const modelScoreFields: string[] = [];
  for (const expected of applicationCsvFields(model)) {
    const matched = findMatchingHeader(expected, csvHeaders);
    if (!matched) continue;
    if (portfolioMatched && matched === portfolioMatched) continue;
    if (!modelScoreFields.includes(matched)) modelScoreFields.push(matched);
  }

  // Prefer Questions-step selection ∩ model csv fields; fall back to model fields.
  const intersected =
    clientScoreFields.length > 0
      ? clientScoreFields.filter((f) => modelScoreFields.includes(f))
      : modelScoreFields;
  const scoreFields = intersected.length > 0 ? intersected : modelScoreFields;

  const portfolioFields = portfolioMatched
    ? [portfolioMatched]
    : clientPortfolioFields.filter((f) => headerSet.has(f));

  return {
    scoreFields,
    customScoreFields: applicationCriterionKeys(model),
    portfolioFields,
  };
}

export type ImportProgressEvent =
  | { type: 'start'; overallTotal: number; teamCount: number }
  | { type: 'team_start'; team: TeamName; teamIndex: number; teamCount: number; applicationTotal: number }
  | { type: 'phase'; phase: 'graders' | 'assignments'; team: TeamName }
  | {
      type: 'application';
      team: TeamName;
      current: number;
      total: number;
      overallCurrent: number;
      overallTotal: number;
    }
  | { type: 'team_complete'; team: TeamName; applicationCount: number; graderCount: number };

export interface UnifiedImportResult {
  roundLabel: string;
  teams: Array<{
    team: Team;
    roundId: number;
    applicationCount: number;
    graderCount: number;
  }>;
  unmatchedCount: number;
}

async function ensureTeamAccessGrant(
  userId: number,
  teamId: number,
  grantedBy: number,
): Promise<void> {
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT id FROM access_grants
          WHERE user_id = ? AND team_id = ? AND revoked_at IS NULL`,
    args: [userId, teamId],
  });
  if (existing.rows.length > 0) return;

  await db.execute({
    sql: `INSERT INTO access_grants (user_id, team_id, is_director, granted_by) VALUES (?, ?, 0, ?)`,
    args: [userId, teamId, grantedBy],
  });
}

async function resolveGraderUsers(
  graders: GraderInput[],
  teamId: number,
  invitedByUserId: number,
): Promise<{ id: number }[]> {
  const users: { id: number }[] = [];
  for (const g of graders) {
    const email = g.email.trim().toLowerCase();
    let user = await getUserByEmail(email);
    if (!user && isTestGraderEmail(email)) {
      user = await createUser({
        name: g.name.trim(),
        email,
        role: 'exec',
        teamIds: [teamId],
        directorTeamIds: [],
        invitedBy: invitedByUserId,
      });
    } else if (user) {
      // Admins have implicit all-team access — don't write access_grants rows for them.
      if (user.role !== 'admin') {
        await ensureTeamAccessGrant(user.id, teamId, invitedByUserId);
      }
    }
    if (!user) {
      throw new Error(`No user found for ${email}. Add them under People first.`);
    }
    users.push({ id: user.id });
  }
  return users;
}

async function importRowsForTeam(params: {
  team: Team;
  roundLabel: string;
  csvHeaders: string[];
  scoreFields: string[];
  portfolioFields: string[];
  contextFields: string[];
  customScoreFields: string[];
  gradingModel?: TeamGradingModel | null;
  rows: SplitRow[];
  graderUserIds: number[];
  graderInstructions?: string;
  gradersPerApplication: number;
  invitedByUserId: number;
  existingRoundId?: number;
  onApplicationProgress?: (current: number, total: number) => void;
  onAssignmentsPhase?: () => void;
}): Promise<ImportRoundResult> {
  const db = getDb();
  const roundId = params.existingRoundId;
  let round;
  if (roundId) {
    await db.execute({
      sql: `UPDATE rounds SET label = ?, status = 'application' WHERE id = ?`,
      args: [params.roundLabel, roundId],
    });
    round = await getRoundById(roundId);
    if (!round) throw new Error(`Failed to reuse round for ${params.team.name}.`);
  } else {
    const roundResult = await db.execute({
      sql: `INSERT INTO rounds (team_id, label, status) VALUES (?, ?, 'application')`,
      args: [params.team.id, params.roundLabel],
    });
    const newRoundId = Number(roundResult.lastInsertRowid);
    round = await getRoundById(newRoundId);
    if (!round) throw new Error(`Failed to create round for ${params.team.name}.`);
    await seedDefaultUnlocksForRound(newRoundId, params.invitedByUserId);
    await applyGlobalPipelineToRound(newRoundId, params.invitedByUserId);
  }

  const orgDates = await getOrgCoffeeChatDates();

  await db.execute({
    sql: `INSERT INTO round_settings (
            round_id, csv_headers, score_fields, custom_score_fields, grader_instructions,
            context_fields, portfolio_fields, graders_per_application, coffee_chat_start_date, application_due_date,
            grading_model
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(round_id) DO UPDATE SET
            csv_headers = excluded.csv_headers,
            score_fields = excluded.score_fields,
            custom_score_fields = excluded.custom_score_fields,
            grader_instructions = excluded.grader_instructions,
            context_fields = excluded.context_fields,
            portfolio_fields = excluded.portfolio_fields,
            graders_per_application = excluded.graders_per_application,
            coffee_chat_start_date = excluded.coffee_chat_start_date,
            application_due_date = excluded.application_due_date,
            grading_model = excluded.grading_model`,
    args: [
      round.id,
      JSON.stringify(params.csvHeaders),
      JSON.stringify(params.scoreFields),
      JSON.stringify(params.customScoreFields),
      params.graderInstructions?.trim() || null,
      JSON.stringify(params.contextFields),
      JSON.stringify(params.portfolioFields),
      params.gradersPerApplication,
      orgDates.coffeeChatStartDate,
      orgDates.applicationDueDate,
      params.gradingModel ? JSON.stringify(params.gradingModel) : null,
    ],
  });

  const appIds: number[] = [];

  // Defense in depth — importUnifiedApplicationRound also pre-checks all teams.
  const teamDupes = findDuplicateCandidateEmails(params.rows);
  if (teamDupes.length > 0) {
    throw new Error(
      formatDuplicateCandidateEmailError(teamDupes, { teamName: params.team.name }),
    );
  }

  for (let i = 0; i < params.rows.length; i++) {
    const { fields, sourceIndex } = params.rows[i];
    const { name, email } = extractCandidateFromFields(fields, {
      uniqueKey: sourceIndex + 1,
    });

    let candidateId: number;
    const existingCandidate = await db.execute({
      sql: 'SELECT id FROM candidates WHERE lower(email) = lower(?) LIMIT 1',
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

    const existingApp = await db.execute({
      sql: `SELECT id FROM applications
            WHERE candidate_id = ? AND round_id = ? AND team_id = ?
            LIMIT 1`,
      args: [candidateId, round.id, params.team.id],
    });
    if (existingApp.rows.length > 0) {
      throw new Error(
        `${params.team.name} already has an application for ${name} (${email}). Erase the partial import (or finalize/reset the round), then import again.`,
      );
    }

    try {
      const appResult = await db.execute({
        sql: `INSERT INTO applications (candidate_id, round_id, team_id, fields, stage, row_index)
              VALUES (?, ?, ?, ?, 'application', ?)`,
        args: [candidateId, round.id, params.team.id, JSON.stringify(fields), i + 1],
      });
      appIds.push(Number(appResult.lastInsertRowid));
    } catch (err) {
      if (isApplicationsUniqueConstraintError(err)) {
        throw new Error(
          `${params.team.name} already has an application for ${name} (${email}). Erase the partial import (or finalize/reset the round), then import again.`,
        );
      }
      throw err;
    }
    params.onApplicationProgress?.(i + 1, params.rows.length);
  }

  params.onAssignmentsPhase?.();

  const assignments = assignGraders(appIds, params.graderUserIds, params.gradersPerApplication);
  for (const a of assignments) {
    await db.execute({
      sql: `INSERT INTO assignments (application_id, user_id, stage) VALUES (?, ?, 'application')`,
      args: [a.applicationId, a.userId],
    });
  }

  const { notifyApplicationsAssigned } = await import('@/lib/notifications');
  await notifyApplicationsAssigned({
    teamId: params.team.id,
    teamName: params.team.name,
    assignments: assignments.map((a) => ({ userId: a.userId })),
  });

  return {
    team: params.team,
    round,
    applicationCount: appIds.length,
    graderCount: params.graderUserIds.length,
  };
}

export async function importUnifiedApplicationRound(
  input: UnifiedImportInput,
): Promise<UnifiedImportResult> {
  const parsed =
    input.spreadsheet ??
    (input.csvText != null && input.csvText !== ''
      ? parseCsv(input.csvText)
      : null);
  if (!parsed) {
    throw new Error('Spreadsheet data is required.');
  }
  const customScoreFields = input.customScoreFields.map((f) => f.trim()).filter(Boolean);
  const roundLabel =
    input.roundLabel.trim() || (await getRecruitmentCycleShortLabel());
  const gradersPerApplication = input.gradersPerApplication ?? DEFAULT_GRADERS_PER_APPLICATION;

  for (const teamName of TEAM_NAMES) {
    const team = await getTeamByName(teamName);
    if (!team) continue;
    const existing = await getActiveRoundForTeam(team.id);
    if (existing) {
      const appCountResult = await getDb().execute({
        sql: 'SELECT COUNT(*) AS count FROM applications WHERE round_id = ?',
        args: [existing.id],
      });
      const hasApplications = ((appCountResult.rows[0]?.count as number) ?? 0) > 0;
      if (hasApplications) {
        throw new Error(`${teamName} already has an active round (${existing.label}). Finalize or reset before re-importing.`);
      }
      const settings = await getRoundSettings(existing.id);
      if (!settings) {
        throw new Error(`${teamName} has an active round (${existing.label}) with missing settings. Reset before re-importing.`);
      }
    }
  }

  const { byTeam, unmatched } = splitRowsByTeam(
    parsed.rows,
    parsed.headers,
    input.teamSplitConfig,
  );

  const teamsWithApps = TEAM_NAMES.filter((name) => byTeam[name].length > 0);
  if (teamsWithApps.length === 0) {
    throw new Error('No applications matched any team. Check your team column mapping.');
  }

  // Fail fast across all teams before creating rounds / inserting anyone.
  const duplicateMessages: string[] = [];
  for (const teamName of teamsWithApps) {
    const duplicates = findDuplicateCandidateEmails(byTeam[teamName]);
    if (duplicates.length > 0) {
      duplicateMessages.push(
        formatDuplicateCandidateEmailError(duplicates, { teamName }),
      );
    }
  }
  if (duplicateMessages.length > 0) {
    throw new Error(duplicateMessages.join(' '));
  }

  for (const teamName of teamsWithApps) {
    const graders = input.gradersByTeam[teamName] ?? [];
    if (graders.length < gradersPerApplication) {
      throw new Error(
        `${teamName} needs at least ${gradersPerApplication} graders (${byTeam[teamName].length} applications).`,
      );
    }

    const teamScoreFields = (input.scoreFieldsByTeam[teamName] ?? []).filter((f) =>
      parsed.headers.includes(f),
    );
    const clientModel = input.gradingModelByTeam?.[teamName];
    if (clientModel) {
      const modelFields = applicationCsvFields(clientModel).filter((f) =>
        parsed.headers.includes(f),
      );
      const intersected =
        teamScoreFields.length > 0
          ? teamScoreFields.filter((f) => modelFields.includes(f))
          : modelFields;
      if ((intersected.length > 0 ? intersected : modelFields).length === 0) {
        throw new Error(`${teamName} needs at least one scored question selected.`);
      }
    } else if (teamScoreFields.length === 0) {
      throw new Error(`${teamName} needs at least one scored question selected.`);
    }
  }

  const results: UnifiedImportResult['teams'] = [];
  const overallTotal = teamsWithApps.reduce((sum, name) => sum + byTeam[name].length, 0);
  let overallCurrent = 0;

  input.onProgress?.({
    type: 'start',
    overallTotal,
    teamCount: teamsWithApps.length,
  });

  for (let teamIndex = 0; teamIndex < teamsWithApps.length; teamIndex++) {
    const teamName = teamsWithApps[teamIndex];
    const team = await getTeamByName(teamName);
    if (!team) throw new Error(`Team ${teamName} not found.`);
    const existingRound = await getActiveRoundForTeam(team.id);

    const applicationTotal = byTeam[teamName].length;

    input.onProgress?.({
      type: 'team_start',
      team: teamName,
      teamIndex: teamIndex + 1,
      teamCount: teamsWithApps.length,
      applicationTotal,
    });

    input.onProgress?.({ type: 'phase', phase: 'graders', team: teamName });

    const graderUserIds = (
      await resolveGraderUsers(input.gradersByTeam[teamName]!, team.id, input.invitedByUserId)
    ).map((u) => u.id);

    const teamScoreFields = (input.scoreFieldsByTeam[teamName] ?? []).filter((f) =>
      parsed.headers.includes(f),
    );
    const teamPortfolioFields = (input.portfolioFieldsByTeam?.[teamName] ?? []).filter((f) =>
      parsed.headers.includes(f),
    );

    const clientModel = input.gradingModelByTeam?.[teamName];
    let resolvedScoreFields: string[];
    let resolvedCustomFields: string[];
    let resolvedPortfolioFields: string[];
    let resolvedInstructions: string | undefined;
    let resolvedGradingModel: TeamGradingModel | null;

    if (clientModel) {
      const derived = resolveFieldsFromGradingModel(
        clientModel,
        parsed.headers,
        teamScoreFields,
        teamPortfolioFields,
      );
      resolvedScoreFields = derived.scoreFields;
      resolvedCustomFields = derived.customScoreFields;
      resolvedPortfolioFields = derived.portfolioFields;
      resolvedGradingModel = clientModel;
      resolvedInstructions =
        input.graderInstructions?.trim() || FALL_2026_GRADER_INSTRUCTIONS;
    } else {
      const fall2026 = buildFall2026RoundRubric(teamName, parsed.headers);
      resolvedScoreFields = fall2026?.scoreFields.length
        ? fall2026.scoreFields.filter((f) => parsed.headers.includes(f))
        : teamScoreFields;
      resolvedCustomFields = fall2026?.customScoreFields ?? customScoreFields;
      resolvedPortfolioFields = fall2026?.portfolioFields.length
        ? fall2026.portfolioFields.filter((f) => parsed.headers.includes(f))
        : teamPortfolioFields;
      resolvedGradingModel = fall2026?.gradingModel ?? null;
      resolvedInstructions =
        fall2026?.graderInstructions ?? input.graderInstructions;
    }

    const result = await importRowsForTeam({
      team,
      roundLabel,
      csvHeaders: parsed.headers,
      scoreFields: resolvedScoreFields,
      portfolioFields: resolvedPortfolioFields,
      contextFields: input.contextFields.filter((h) => parsed.headers.includes(h)),
      customScoreFields: resolvedCustomFields,
      gradingModel: resolvedGradingModel,
      rows: byTeam[teamName],
      graderUserIds,
      graderInstructions: resolvedInstructions,
      gradersPerApplication,
      invitedByUserId: input.invitedByUserId,
      existingRoundId: existingRound?.id,
      onApplicationProgress: (current, total) => {
        overallCurrent += 1;
        input.onProgress?.({
          type: 'application',
          team: teamName,
          current,
          total,
          overallCurrent,
          overallTotal,
        });
      },
      onAssignmentsPhase: () => {
        input.onProgress?.({ type: 'phase', phase: 'assignments', team: teamName });
      },
    });

    results.push({
      team: result.team,
      roundId: result.round.id,
      applicationCount: result.applicationCount,
      graderCount: result.graderCount,
    });

    input.onProgress?.({
      type: 'team_complete',
      team: teamName,
      applicationCount: result.applicationCount,
      graderCount: result.graderCount,
    });
  }

  return {
    roundLabel,
    teams: results,
    unmatchedCount: unmatched.length,
  };
}

