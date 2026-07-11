import 'server-only';

import { getDb, getTeams } from '@/lib/db';
import { isDeliberationsFinalSelectionComplete } from '@/lib/deliberations';

/**
 * True when every org team has locked final selection (Accept → offers).
 * Used to unlock the celebration dialog for non-admins.
 */
export async function isOrgFinalSelectionComplete(): Promise<boolean> {
  const teams = await getTeams();
  if (teams.length === 0) return false;

  const flags = await Promise.all(
    teams.map(async (team) => {
      const roundResult = await getDb().execute({
        sql: `SELECT id FROM rounds
              WHERE team_id = ?
              ORDER BY created_at DESC
              LIMIT 1`,
        args: [team.id],
      });
      const roundId = roundResult.rows[0]?.id;
      if (roundId == null) return false;
      return isDeliberationsFinalSelectionComplete(team.id, Number(roundId));
    }),
  );

  return flags.every(Boolean);
}
