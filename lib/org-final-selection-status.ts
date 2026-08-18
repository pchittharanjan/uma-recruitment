import 'server-only';

import { getTeams } from '@/lib/db';
import { isDeliberationsFinalSelectionComplete } from '@/lib/deliberations';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';

/**
 * True when every org team has locked final selection (Accept → offers).
 * Used to unlock the celebration dialog for non-admins.
 *
 * Mid-pipeline cuts (application / first-round advancement) must never
 * count — those also produce `rejected` rows but are not final selection.
 */
export async function isOrgFinalSelectionComplete(): Promise<boolean> {
  const [teams, globalState] = await Promise.all([getTeams(), getGlobalPipelineState()]);
  if (teams.length === 0) return false;
  if (globalState.status !== 'deliberations' && globalState.status !== 'closed') {
    return false;
  }

  const withRound = globalState.teams.filter(
    (team): team is typeof team & { round: NonNullable<typeof team.round> } => team.round != null,
  );
  const roundIdByTeam = new Map(withRound.map((team) => [team.teamId, team.round.id]));

  const flags = await Promise.all(
    teams.map((team) => {
      const roundId = roundIdByTeam.get(team.id);
      if (roundId == null) return Promise.resolve(false);
      return isDeliberationsFinalSelectionComplete(team.id, roundId);
    }),
  );

  return flags.every(Boolean);
}
