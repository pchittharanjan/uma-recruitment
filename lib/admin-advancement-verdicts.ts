import { getDb } from '@/lib/db';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import {
  isAdvancementVerdict,
  normalizeAdvancementVerdict,
  type AdvancementVerdict,
} from '@/lib/advancement-verdict-types';

export async function setAdminAdvancementVerdict(
  adminUserId: number,
  teamId: number,
  roundId: number,
  applicationId: number,
  fromStage: AdvancementFromStage,
  verdict: AdvancementVerdict | null,
): Promise<void> {
  const db = getDb();

  const appCheck = await db.execute({
    sql: `SELECT id FROM applications
          WHERE id = ? AND team_id = ? AND round_id = ?`,
    args: [applicationId, teamId, roundId],
  });
  if (appCheck.rows.length === 0) {
    throw new Error('Applicant not found for this team.');
  }

  if (verdict === null) {
    await db.execute({
      sql: `DELETE FROM admin_advancement_verdicts
            WHERE team_id = ? AND round_id = ? AND application_id = ? AND from_stage = ? AND admin_user_id = ?`,
      args: [teamId, roundId, applicationId, fromStage, adminUserId],
    });
    return;
  }

  if (!isAdvancementVerdict(verdict)) {
    throw new Error('Invalid advancement verdict.');
  }

  await db.execute({
    sql: `INSERT INTO admin_advancement_verdicts
            (team_id, round_id, application_id, from_stage, admin_user_id, verdict, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(team_id, round_id, application_id, from_stage, admin_user_id)
          DO UPDATE SET verdict = excluded.verdict, updated_at = unixepoch()`,
    args: [teamId, roundId, applicationId, fromStage, adminUserId, verdict],
  });
}

export async function listAdminAdvancementVerdicts(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
  adminUserId: number,
  applicationIds: number[],
): Promise<Map<number, AdvancementVerdict | null>> {
  const byApp = new Map<number, AdvancementVerdict | null>();
  if (applicationIds.length === 0) return byApp;

  const db = getDb();
  const placeholders = applicationIds.map(() => '?').join(',');

  const result = await db.execute({
    sql: `SELECT application_id, verdict
          FROM admin_advancement_verdicts
          WHERE team_id = ? AND round_id = ? AND from_stage = ? AND admin_user_id = ?
            AND application_id IN (${placeholders})`,
    args: [teamId, roundId, fromStage, adminUserId, ...applicationIds],
  });

  for (const row of result.rows) {
    byApp.set(
      row.application_id as number,
      normalizeAdvancementVerdict(row.verdict as string | null),
    );
  }

  return byApp;
}
