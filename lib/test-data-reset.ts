import { getDb } from '@/lib/db';

export interface TestDataPurgeResult {
  roundsRemoved: number;
  coffeeChatsRemoved: number;
  testUsersRemoved: number;
  orphanCandidatesRemoved: number;
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

  return {
    roundsRemoved: roundIds.length,
    coffeeChatsRemoved: coffeeChats.rowsAffected,
    testUsersRemoved: testUserIds.length,
    orphanCandidatesRemoved: orphanCandidates.rowsAffected,
  };
}
