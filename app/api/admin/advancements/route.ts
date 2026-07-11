export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeams, initDb } from '@/lib/db';
import { listAdvancementSubmissionActivity, listPendingAdvancementSubmissions } from '@/lib/advancement-submissions';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getTeamAdvancementStatus } from '@/lib/admin-team-status';
import { getTeamAdvancementOutcome } from '@/lib/advancement-admin';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { getActiveRoundForTeam } from '@/lib/rounds';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const submissions = await listPendingAdvancementSubmissions();
    const activity = await listAdvancementSubmissionActivity();

    const includeReadiness = req.nextUrl.searchParams.get('includeReadiness') === '1';
    let teamReadiness: Array<{
      teamId: number;
      teamName: string;
      fromStage: AdvancementFromStage;
      status: Awaited<ReturnType<typeof getTeamAdvancementStatus>>;
      outcome: Awaited<ReturnType<typeof getTeamAdvancementOutcome>>;
    }> = [];

    if (includeReadiness) {
      const globalState = await getGlobalPipelineState();
      const fromStage: AdvancementFromStage | null =
        globalState.status === 'application'
          ? 'application'
          : globalState.status === 'first_round'
            ? 'first_round'
            : null;

      if (fromStage) {
        const teams = await getTeams();
        const rows = await Promise.all(
          teams.map(async (team) => {
            const round = await getActiveRoundForTeam(team.id);
            if (!round) return null;
            const [status, outcome] = await Promise.all([
              getTeamAdvancementStatus(team.id, round.id, fromStage),
              getTeamAdvancementOutcome(team.id, round.id, fromStage),
            ]);
            return { teamId: team.id, teamName: team.name, fromStage, status, outcome };
          }),
        );
        teamReadiness = rows.filter((row): row is NonNullable<typeof row> => row !== null);
      }
    }

    return NextResponse.json({ submissions, activity, teamReadiness });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
