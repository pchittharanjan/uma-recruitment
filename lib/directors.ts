import { getDb } from '@/lib/db';
import { MAX_DIRECTORS_PER_TEAM } from '@/lib/director-limits';

export { MAX_DIRECTORS_PER_TEAM } from '@/lib/director-limits';

/** Whether this user is a team director for the given team (query-layer check). */
export async function isTeamDirector(userId: number, teamId: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT 1 FROM access_grants
          WHERE user_id = ? AND team_id = ? AND is_director = 1 AND revoked_at IS NULL
          LIMIT 1`,
    args: [userId, teamId],
  });
  return result.rows.length > 0;
}

export async function countTeamDirectors(teamId: number, excludeUserId?: number): Promise<number> {
  const db = getDb();
  const args: number[] = [teamId];
  let excludeClause = '';
  if (excludeUserId !== undefined) {
    excludeClause = ' AND user_id != ?';
    args.push(excludeUserId);
  }
  const result = await db.execute({
    sql: `SELECT COUNT(DISTINCT user_id) AS count
          FROM access_grants
          WHERE team_id = ? AND is_director = 1 AND revoked_at IS NULL${excludeClause}`,
    args,
  });
  // libSQL may return COUNT as a string; coerce so `existing + adding` never string-concats.
  return Number(result.rows[0]?.count ?? 0);
}

export class DirectorLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorLimitError';
  }
}

export async function validateDirectorTeamAssignments(
  teamDirectorPairs: Array<{ teamId: number; isDirector: boolean }>,
  excludeUserId?: number,
): Promise<void> {
  const directorsAddedByTeam = new Map<number, number>();
  for (const { teamId, isDirector } of teamDirectorPairs) {
    if (!isDirector) continue;
    directorsAddedByTeam.set(teamId, (directorsAddedByTeam.get(teamId) ?? 0) + 1);
  }

  for (const [teamId, adding] of directorsAddedByTeam) {
    const existing = await countTeamDirectors(teamId, excludeUserId);
    if (existing + adding > MAX_DIRECTORS_PER_TEAM) {
      throw new DirectorLimitError(
        `Each team can have at most ${MAX_DIRECTORS_PER_TEAM} Directors. This change would exceed that limit.`,
      );
    }
  }
}

export async function listDirectorTeamIdsForUser(userId: number): Promise<number[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT team_id FROM access_grants
          WHERE user_id = ? AND is_director = 1 AND revoked_at IS NULL
          ORDER BY team_id ASC`,
    args: [userId],
  });
  return result.rows.map((row) => row.team_id as number);
}
