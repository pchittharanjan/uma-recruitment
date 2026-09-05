import 'server-only';

import { getDb, type TeamName } from '@/lib/db';
import {
  primaryScoredQuestions,
  resolveGradingRubric,
  splitScoreRows,
  type ResolvedGradingRubric,
} from '@/lib/grading-model';
import type { RoundSettings } from '@/lib/rounds';

export interface AdvancementQuestionNote {
  label: string;
  note: string;
}

export interface AdvancementStageReview {
  userId: number;
  reviewerName: string;
  status: string;
  comment: string | null;
  scores: Record<string, number>;
  questionNotes: AdvancementQuestionNote[];
  average: number | null;
}

function meanOfScores(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 1000) / 1000;
}

function questionLabelsFromRubric(rubric: ResolvedGradingRubric): Map<string, string> {
  const labels = new Map<string, string>();
  for (const question of primaryScoredQuestions(rubric.applicationQuestions)) {
    labels.set(question.id, question.label);
  }
  return labels;
}

function toQuestionNotes(
  notes: Record<string, string>,
  labels?: Map<string, string>,
): AdvancementQuestionNote[] {
  const out: AdvancementQuestionNote[] = [];
  for (const [key, value] of Object.entries(notes)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.push({ label: labels?.get(key) ?? key, note: trimmed });
  }
  return out;
}

/**
 * Load every assignment review (comment + per-question notes + scores) for a stage,
 * keyed by application id. Used during advancement color-selection so the whole team
 * can read each other’s notes.
 */
export async function loadAdvancementStageReviews(options: {
  teamId: number;
  roundId: number;
  stage: 'application' | 'first_round' | 'final_round';
  applicationIds: number[];
  /** Relabel application question ids → human labels when provided. */
  questionLabels?: Map<string, string>;
}): Promise<Map<number, AdvancementStageReview[]>> {
  const byApp = new Map<number, AdvancementStageReview[]>();
  const { teamId, roundId, stage, applicationIds, questionLabels } = options;
  if (applicationIds.length === 0) return byApp;

  const db = getDb();
  const placeholders = applicationIds.map(() => '?').join(',');

  const assignmentsResult = await db.execute({
    sql: `SELECT a.id AS assignment_id, a.application_id, a.user_id, a.status, a.comment,
                 u.name AS reviewer_name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN users u ON u.id = a.user_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ?
            AND a.application_id IN (${placeholders})
          ORDER BY a.application_id ASC, u.name ASC`,
    args: [teamId, roundId, stage, ...applicationIds],
  });

  if (assignmentsResult.rows.length === 0) return byApp;

  const assignmentIds = assignmentsResult.rows.map((row) => row.assignment_id as number);
  const scorePlaceholders = assignmentIds.map(() => '?').join(',');
  const scoresResult = await db.execute({
    sql: `SELECT assignment_id, field_name, score, note
          FROM scores
          WHERE assignment_id IN (${scorePlaceholders})`,
    args: assignmentIds,
  });

  const splitByAssignment = new Map<
    number,
    { scores: Record<string, number>; notes: Record<string, string> }
  >();
  const rowsByAssignment = new Map<number, typeof scoresResult.rows>();
  for (const row of scoresResult.rows) {
    const assignmentId = row.assignment_id as number;
    const bucket = rowsByAssignment.get(assignmentId) ?? [];
    bucket.push(row);
    rowsByAssignment.set(assignmentId, bucket);
  }
  for (const [assignmentId, rows] of rowsByAssignment) {
    splitByAssignment.set(assignmentId, splitScoreRows(rows));
  }

  for (const row of assignmentsResult.rows) {
    const applicationId = row.application_id as number;
    const assignmentId = row.assignment_id as number;
    const split = splitByAssignment.get(assignmentId) ?? { scores: {}, notes: {} };
    const scoreValues = Object.values(split.scores);
    const review: AdvancementStageReview = {
      userId: row.user_id as number,
      reviewerName: (row.reviewer_name as string) || 'Unknown',
      status: row.status as string,
      comment: (row.comment as string | null) ?? null,
      scores: split.scores,
      questionNotes: toQuestionNotes(split.notes, questionLabels),
      average: meanOfScores(scoreValues),
    };
    const list = byApp.get(applicationId) ?? [];
    list.push(review);
    byApp.set(applicationId, list);
  }

  return byApp;
}

export function applicationQuestionLabels(
  settings: RoundSettings,
  teamName: string,
): Map<string, string> {
  const rubric = resolveGradingRubric(settings, teamName as TeamName);
  return questionLabelsFromRubric(rubric);
}
