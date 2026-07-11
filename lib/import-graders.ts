import { getDb, getTeamByName, type TeamName } from '@/lib/db';
import { isBerkeleyEmail } from '@/lib/auth';
import type { GraderInput } from '@/lib/grader-parse';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { EXEC_ROLE_SQL_VALUES } from '@/lib/roles';

export interface EligibleGraderUser extends GraderInput {
  role: string;
}

/** Users with team access who can grade during Application import. */
export async function listExistingGradersForTeams(
  teamNames: TeamName[],
): Promise<Partial<Record<TeamName, GraderInput[]>>> {
  if (teamNames.length === 0) return {};

  const db = getDb();
  const result: Partial<Record<TeamName, GraderInput[]>> = {};

  for (const teamName of teamNames) {
    const team = await getTeamByName(teamName);
    if (!team) {
      result[teamName] = [];
      continue;
    }

    const activeRound = await getActiveRoundForTeam(team.id);
    const roundId = activeRound?.id ?? null;

    const execRoles = EXEC_ROLE_SQL_VALUES.map(() => '?').join(', ');
    const roundClause = roundId
      ? '(ag.round_id IS NULL OR ag.round_id = ?)'
      : 'ag.round_id IS NULL';
    const rows = await db.execute({
      sql: `SELECT DISTINCT u.name, u.email
            FROM users u
            JOIN access_grants ag ON ag.user_id = u.id AND ag.revoked_at IS NULL
            WHERE ag.team_id = ?
              AND u.role IN (${execRoles}, 'ad_hoc_exec', 'admin')
              AND ${roundClause}
              AND (
                u.role IN (${execRoles}, 'admin')
                OR ag.stage IS NULL
                OR ag.stage = 'application'
              )
            ORDER BY u.name COLLATE NOCASE ASC, u.email ASC`,
      args: [
        team.id,
        ...EXEC_ROLE_SQL_VALUES,
        ...(roundId ? [roundId] : []),
        ...EXEC_ROLE_SQL_VALUES,
      ],
    });

    result[teamName] = rows.rows.map((row) => ({
      name: row.name as string,
      email: row.email as string,
    }));
  }

  return result;
}

/** People users with @berkeley.edu emails — eligible to add during Application import. */
export async function listEligibleGraderUsers(): Promise<EligibleGraderUser[]> {
  const db = getDb();
  const rows = await db.execute({
    sql: `SELECT name, email, role
          FROM users
          ORDER BY name COLLATE NOCASE ASC, email ASC`,
  });

  return rows.rows
    .map((row) => ({
      name: (row.name as string).trim(),
      email: (row.email as string).trim(),
      role: row.role as string,
    }))
    .filter((user) => user.name && user.email && isBerkeleyEmail(user.email));
}
