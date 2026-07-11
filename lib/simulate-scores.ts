import { getDb } from '@/lib/db';
import {
  interviewScoreFieldsFromGuide,
  type InterviewGuideStage,
} from '@/lib/interview-guide';
import { getInterviewGuideForRound } from '@/lib/interview-slots';
import { getRoundSettings } from '@/lib/rounds';

const BATCH_CHUNK_SIZE = 200;

function randomScore(): number {
  return Math.floor(Math.random() * 5) + 1;
}

export interface SimulateScoresResult {
  assignmentsCompleted: number;
  scoresWritten: number;
}

type BatchStatement = {
  sql: string;
  args: (string | number)[];
};

async function runBatched(statements: BatchStatement[]): Promise<void> {
  if (statements.length === 0) return;
  const db = getDb();
  for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + BATCH_CHUNK_SIZE));
  }
}

async function simulatePendingAssignments(
  teamId: number,
  roundId: number,
  stage: 'application' | InterviewGuideStage,
  scoreFieldNames: string[],
): Promise<SimulateScoresResult> {
  const db = getDb();
  const pending = await db.execute({
    sql: `SELECT a.id as assignment_id
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ? AND app.stage = ?
            AND a.status = 'pending'`,
    args: [teamId, roundId, stage, stage],
  });

  const statements: BatchStatement[] = [];
  let scoresWritten = 0;

  for (const row of pending.rows) {
    const assignmentId = row.assignment_id as number;

    for (const fieldName of scoreFieldNames) {
      statements.push({
        sql: `INSERT INTO scores (assignment_id, field_name, score)
              VALUES (?, ?, ?)
              ON CONFLICT(assignment_id, field_name) DO UPDATE SET score = excluded.score`,
        args: [assignmentId, fieldName, randomScore()],
      });
      scoresWritten += 1;
    }

    statements.push({
      sql: `UPDATE assignments SET status = 'completed', completed_at = unixepoch() WHERE id = ?`,
      args: [assignmentId],
    });
  }

  await runBatched(statements);

  return {
    assignmentsCompleted: pending.rows.length,
    scoresWritten,
  };
}

/** Fill pending application-stage assignments with random 1–5 scores (dev/testing). */
export async function simulateTeamScores(
  teamId: number,
  roundId: number,
): Promise<SimulateScoresResult> {
  const settings = await getRoundSettings(roundId);
  if (!settings) throw new Error('Round settings not found.');

  const scoreFieldNames = [...settings.score_fields, ...settings.custom_score_fields];
  if (scoreFieldNames.length === 0) {
    throw new Error('No scored fields configured for this round.');
  }

  return simulatePendingAssignments(teamId, roundId, 'application', scoreFieldNames);
}

/** Fill pending interview assignments with random 1–5 scores (dev/testing). */
export async function simulateTeamInterviewScores(
  teamId: number,
  roundId: number,
  stage: InterviewGuideStage,
): Promise<SimulateScoresResult> {
  const interviewGuide = await getInterviewGuideForRound(roundId, stage);
  const scoreFieldNames = interviewScoreFieldsFromGuide(interviewGuide);
  if (scoreFieldNames.length === 0) {
    throw new Error('No scored fields configured for this interview stage.');
  }

  return simulatePendingAssignments(teamId, roundId, stage, scoreFieldNames);
}
