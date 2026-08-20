import 'server-only';

import { batchDeliberationsFinalSelectionComplete } from '@/lib/batch-team-stats';
import { getTeams } from '@/lib/db';
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

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const withRound = globalState.teams.filter(
    (team): team is typeof team & { round: NonNullable<typeof team.round> } => team.round != null,
  );

  const entries = teams.flatMap((team) => {
    const pipelineEntry = withRound.find((t) => t.teamId === team.id);
    if (!pipelineEntry) return [];
    return [
      {
        teamId: team.id,
        roundId: pipelineEntry.round.id,
        teamName: teamNameById.get(team.id) ?? pipelineEntry.teamName,
      },
    ];
  });

  const flags = await batchDeliberationsFinalSelectionComplete(entries);
  return teams.every((team) => flags.get(team.id) === true);
}
