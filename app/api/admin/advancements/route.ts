export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { listAdvancementSubmissionActivity, listPendingAdvancementSubmissions } from '@/lib/advancement-submissions';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getTeamAdvancementStatus } from '@/lib/admin-team-status';
import { getTeamAdvancementOutcome } from '@/lib/advancement-admin';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/advancements', async () => {
      try {
        await initDb();
        if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

        const includeReadiness = req.nextUrl.searchParams.get('includeReadiness') === '1';

        const [submissions, activity, globalState] = await Promise.all([
          listPendingAdvancementSubmissions(),
          listAdvancementSubmissionActivity(),
          includeReadiness ? getGlobalPipelineState() : Promise.resolve(null),
        ]);

        let teamReadiness: Array<{
          teamId: number;
          teamName: string;
          fromStage: AdvancementFromStage;
          status: Awaited<ReturnType<typeof getTeamAdvancementStatus>>;
          outcome: Awaited<ReturnType<typeof getTeamAdvancementOutcome>>;
        }> = [];

        if (includeReadiness && globalState) {
          const fromStage: AdvancementFromStage | null =
            globalState.status === 'application'
              ? 'application'
              : globalState.status === 'first_round'
                ? 'first_round'
                : null;

          if (fromStage) {
            const withRound = globalState.teams.filter((t) => t.round);
            const rows = await Promise.all(
              withRound.map(async (team) => {
                const round = team.round!;
                const [status, outcome] = await Promise.all([
                  getTeamAdvancementStatus(team.teamId, round.id, fromStage),
                  getTeamAdvancementOutcome(team.teamId, round.id, fromStage),
                ]);
                return {
                  teamId: team.teamId,
                  teamName: team.teamName,
                  fromStage,
                  status,
                  outcome,
                };
              }),
            );
            teamReadiness = rows;
          }
        }

        return NextResponse.json({ submissions, activity, teamReadiness });
      } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }),
  );
}
