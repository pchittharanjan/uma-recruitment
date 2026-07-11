export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeams, initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundsByTeam } from '@/lib/pipeline-phase';

/**
 * Lightweight team list for pickers (id, name, hasRound).
 * Prefer this over /api/admin/dashboard when stats are not needed.
 */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teams = await getTeams();
    const rounds = await getActiveRoundsByTeam();
    const roundByTeam = new Map(rounds.map((t) => [t.teamId, t.round]));

    return NextResponse.json({
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        hasRound: roundByTeam.get(team.id) != null,
      })),
    });
  } catch (e) {
    console.error('GET /api/admin/teams failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
