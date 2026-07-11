import {
  getActiveAccessGrantsForUser,
  getTeams,
  type Team,
  type User,
  type UserRole,
} from '@/lib/db';

/** Admins implicitly have all-team access — no access_grants rows required. */
export async function getAccessibleTeamIds(user: User): Promise<number[]> {
  if (user.role === 'admin') {
    const teams = await getTeams();
    return teams.map((t) => t.id);
  }

  const grants = await getActiveAccessGrantsForUser(user.id);
  return [...new Set(grants.map((g) => g.team_id))];
}

export async function getAccessibleTeams(user: User): Promise<Team[]> {
  const allTeams = await getTeams();
  if (user.role === 'admin') return allTeams;

  const teamIds = new Set(await getAccessibleTeamIds(user));
  return allTeams.filter((t) => teamIds.has(t.id));
}

export async function userHasTeamAccess(user: User, teamId: number): Promise<boolean> {
  const teamIds = await getAccessibleTeamIds(user);
  return teamIds.includes(teamId);
}

export function isGraderRole(role: UserRole): boolean {
  return role === 'exec' || role === 'ad_hoc_exec';
}
