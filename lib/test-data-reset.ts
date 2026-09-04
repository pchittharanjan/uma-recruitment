import { getDb } from '@/lib/db';
import { reclaimApplicationIds } from '@/lib/admin-applications';
import { DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import { getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';
import { invalidateProcessCache } from '@/lib/process-cache';

export interface TestDataPurgeResult {
  roundsRemoved: number;
  coffeeChatsRemoved: number;
  testUsersRemoved: number;
  orphanCandidatesRemoved: number;
  roundsSeeded: number;
}

/** Create one empty Application-phase round per team so Import is immediately available. */
async function seedApplicationRoundsForImport(): Promise<number> {
  const db = getDb();
  const roundLabel = await getRecruitmentCycleShortLabel();
  const teams = await db.execute({ sql: 'SELECT id FROM teams ORDER BY id' });
  let seeded = 0;

  for (const teamRow of teams.rows) {
    const teamId = teamRow.id as number;
    const existing = await db.execute({
      sql: `SELECT id FROM rounds WHERE team_id = ? AND status != 'closed' LIMIT 1`,
      args: [teamId],
    });
    if (existing.rows.length > 0) continue;

    const roundInsert = await db.execute({
      sql: `INSERT INTO rounds (team_id, label, status)
            VALUES (?, ?, 'application')`,
      args: [teamId, roundLabel],
    });
    const roundId = Number(roundInsert.lastInsertRowid);
    await db.execute({
      sql: `INSERT INTO round_settings (
              round_id, csv_headers, score_fields, custom_score_fields, context_fields,
              portfolio_fields, graders_per_application, coffee_chat_start_date, application_due_date
            ) VALUES (?, '[]', '[]', '[]', '[]', '[]', ?, NULL, NULL)`,
      args: [roundId, DEFAULT_GRADERS_PER_APPLICATION],
    });
    seeded += 1;
  }

  return seeded;
}

/** Wipe all rounds (including closed archive), coffee chat submissions, and simulated `.test@berkeley.edu` grader accounts. */
export async function purgeTestRecruitmentData(): Promise<TestDataPurgeResult> {
  const db = getDb();

  // Org-wide intake — survives round deletion (round_id ON DELETE SET NULL).
  const coffeeChats = await db.execute({ sql: 'DELETE FROM coffee_chats' });
  await db.execute({
    sql: `INSERT INTO org_coffee_chat_dates (id, coffee_chat_start_date, application_due_date)
          VALUES (1, NULL, NULL)
          ON CONFLICT(id) DO UPDATE SET
            coffee_chat_start_date = NULL,
            application_due_date = NULL`,
  });

  const roundsResult = await db.execute({
    sql: `SELECT id FROM rounds`,
  });
  const roundIds = roundsResult.rows.map((row) => row.id as number);

  if (roundIds.length > 0) {
    const placeholders = roundIds.map(() => '?').join(',');

    // Deliberation sessions block round deletion (no ON DELETE CASCADE).
    await db.execute({
      sql: `DELETE FROM deliberation_sessions WHERE round_id IN (${placeholders})`,
      args: roundIds,
    });

    // Round-scoped access grants block round deletion when FK enforcement is on.
    await db.execute({
      sql: `UPDATE access_grants SET revoked_at = unixepoch()
            WHERE round_id IN (${placeholders}) AND revoked_at IS NULL`,
      args: roundIds,
    });

    // Applications cascade to assignments, scores, and flags.
    await db.execute({
      sql: `DELETE FROM applications WHERE round_id IN (${placeholders})`,
      args: roundIds,
    });
    await reclaimApplicationIds();

    await db.execute({
      sql: `DELETE FROM team_advancement_submissions WHERE round_id IN (${placeholders})`,
      args: roundIds,
    });
    await db.execute({
      sql: `DELETE FROM pre_application_notes WHERE round_id IN (${placeholders})`,
      args: roundIds,
    });
    await db.execute({
      sql: `DELETE FROM interview_slots WHERE round_id IN (${placeholders})`,
      args: roundIds,
    });

    // round_settings, round_stage_unlocks, round_communications, and
    // round_outcome_emails cascade from rounds.
    await db.execute({
      sql: `DELETE FROM rounds WHERE id IN (${placeholders})`,
      args: roundIds,
    });
  }

  const testUsersResult = await db.execute({
    sql: `SELECT id FROM users WHERE email LIKE '%.test@berkeley.edu'`,
  });
  const testUserIds = testUsersResult.rows.map((row) => row.id as number);

  if (testUserIds.length > 0) {
    const placeholders = testUserIds.map(() => '?').join(',');
    await db.execute({
      sql: `DELETE FROM notifications WHERE user_id IN (${placeholders})`,
      args: testUserIds,
    });
    await db.execute({
      sql: `DELETE FROM access_grants WHERE user_id IN (${placeholders})`,
      args: testUserIds,
    });
    await db.execute({
      sql: `DELETE FROM assignments WHERE user_id IN (${placeholders})`,
      args: testUserIds,
    });
    await db.execute({
      sql: `DELETE FROM users WHERE id IN (${placeholders})`,
      args: testUserIds,
    });
  }

  const orphanCandidates = await db.execute({
    sql: `DELETE FROM candidates
          WHERE id NOT IN (SELECT DISTINCT candidate_id FROM applications)`,
  });

  // Ready for re-import: Application-phase empty rounds (not pre_application).
  // Without this, ensureRecruitmentRoundsStarted() recreates Coffee Chat rounds and
  // /admin/import stays blocked even though applications were wiped.
  const roundsSeeded = await seedApplicationRoundsForImport();

  // Drop stale hot reads (anyTeamHasActivePipeline is cached 15s and would keep
  // showing "Applications are already imported" after a successful erase).
  invalidateProcessCache();

  return {
    roundsRemoved: roundIds.length,
    coffeeChatsRemoved: coffeeChats.rowsAffected,
    testUsersRemoved: testUserIds.length,
    orphanCandidatesRemoved: orphanCandidates.rowsAffected,
    roundsSeeded,
  };
}
