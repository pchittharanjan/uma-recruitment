export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { buildDeliberationsCandidateDetails } from '@/lib/deliberations';

/** Batch candidate details for compare — `?ids=1,2,3` (max 8). */
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

    const idsRaw = req.nextUrl.searchParams.get('ids') ?? '';
    const applicationIds = idsRaw
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 8);

    if (applicationIds.length === 0) {
      return NextResponse.json({ error: 'Provide ids query (comma-separated).' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const details = await buildDeliberationsCandidateDetails(teamId, round.id, applicationIds);
    return NextResponse.json({ details });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/deliberations/details failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
