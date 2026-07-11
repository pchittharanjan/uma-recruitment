import { getDb } from '@/lib/db';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import {
  normalizeAdvancementVerdict,
  type AdvancementVerdict,
} from '@/lib/advancement-verdict-types';

export type { AdvancementVerdict } from '@/lib/advancement-verdict-types';
export {
  ADVANCEMENT_VERDICT_VALUES,
  isAdvancementVerdict,
  isStrongAdvanceSignal,
  normalizeAdvancementVerdict,
  verdictLabel,
} from '@/lib/advancement-verdict-types';

export async function setAssignmentAdvancementVerdict(
  userId: number,
  teamId: number,
  roundId: number,
  applicationId: number,
  fromStage: AdvancementFromStage,
  verdict: AdvancementVerdict | null,
): Promise<void> {
  const db = getDb();
  const stage = fromStage === 'first_round' ? 'first_round' : 'application';

  const assignment = await db.execute({
    sql: `SELECT a.id, a.status
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE a.user_id = ? AND a.application_id = ? AND a.stage = ?
            AND app.team_id = ? AND app.round_id = ?`,
    args: [userId, applicationId, stage, teamId, roundId],
  });

  if (assignment.rows.length === 0) {
    throw new Error('You are not assigned to this applicant.');
  }

  const row = assignment.rows[0];
  if (row.status !== 'completed') {
    throw new Error('Complete your review before setting an advancement verdict.');
  }

  await db.execute({
    sql: `UPDATE assignments SET advancement_verdict = ? WHERE id = ?`,
    args: [verdict, row.id as number],
  });
}

export async function listTeamAdvancementVerdicts(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
  applicationIds: number[],
): Promise<
  Map<
    number,
    Array<{ userId: number; name: string; verdict: AdvancementVerdict | null }>
  >
> {
  const byApp = new Map<
    number,
    Array<{ userId: number; name: string; verdict: AdvancementVerdict | null }>
  >();
  if (applicationIds.length === 0) return byApp;

  const db = getDb();
  const stage = fromStage === 'first_round' ? 'first_round' : 'application';
  const placeholders = applicationIds.map(() => '?').join(',');

  const result = await db.execute({
    sql: `SELECT a.application_id, a.user_id, a.advancement_verdict, u.name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN users u ON u.id = a.user_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ?
            AND a.application_id IN (${placeholders})
          ORDER BY a.application_id ASC, u.name ASC`,
    args: [teamId, roundId, stage, ...applicationIds],
  });

  for (const row of result.rows) {
    const applicationId = row.application_id as number;
    if (!byApp.has(applicationId)) byApp.set(applicationId, []);
    byApp.get(applicationId)!.push({
      userId: row.user_id as number,
      name: row.name as string,
      verdict: normalizeAdvancementVerdict(row.advancement_verdict as string | null),
    });
  }

  return byApp;
}

/** Union of application IDs with a Green panel signal on a completed assignment. */
export async function aggregatePanelGreenApplicationIds(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
): Promise<number[]> {
  const db = getDb();
  const stage = fromStage === 'first_round' ? 'first_round' : 'application';

  const result = await db.execute({
    sql: `SELECT DISTINCT a.application_id
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ?
            AND app.stage = ?
            AND a.status = 'completed'
            AND a.advancement_verdict IN ('green', 'yes')
          ORDER BY a.application_id ASC`,
    args: [teamId, roundId, stage, stage],
  });

  return result.rows.map((row) => row.application_id as number);
}
