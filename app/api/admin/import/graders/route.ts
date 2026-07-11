export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, type TeamName } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  listEligibleGraderUsers,
  listExistingGradersForTeams,
} from '@/lib/import-graders';
import { TEAM_NAMES } from '@/lib/team-split';

function parseTeamNames(raw: string | null): TeamName[] {
  if (!raw?.trim()) return [];
  const allowed = new Set<string>(TEAM_NAMES);
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is TeamName => allowed.has(part));
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const teams = parseTeamNames(req.nextUrl.searchParams.get('teams'));
    if (teams.length === 0) {
      return NextResponse.json({ error: 'Provide at least one team name.' }, { status: 400 });
    }

    const [gradersByTeam, eligibleUsers] = await Promise.all([
      listExistingGradersForTeams(teams),
      listEligibleGraderUsers(),
    ]);
    return NextResponse.json({ gradersByTeam, eligibleUsers });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
