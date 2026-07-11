export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getTeamAdvancementStatus } from '@/lib/admin-team-status';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';

const VALID_FROM_STAGES: AdvancementFromStage[] = ['application', 'first_round'];

function parseFromStage(
  param: string | null,
  roundStatus: string,
): AdvancementFromStage | null {
  if (param === 'application' || param === 'first_round') return param;
  if (roundStatus === 'application') return 'application';
  if (roundStatus === 'first_round') return 'first_round';
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const fromStage = parseFromStage(req.nextUrl.searchParams.get('fromStage'), round.status);
    if (!fromStage || !VALID_FROM_STAGES.includes(fromStage)) {
      return NextResponse.json(
        {
          error:
            'Advancement status is only available during application or first round. Pass ?fromStage=application or ?fromStage=first_round.',
        },
        { status: 400 },
      );
    }

    const status = await getTeamAdvancementStatus(teamId, round.id, fromStage);

    return NextResponse.json({
      team,
      round,
      status,
    });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/advancement-status failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
