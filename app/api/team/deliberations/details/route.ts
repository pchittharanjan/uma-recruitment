export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { forbidden, unauthorized, notFound } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { buildDeliberationsCandidateDetails } from '@/lib/deliberations';

/** Batch candidate details for compare — `?teamId=&ids=1,2,3` (max 8). */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    const idsRaw = req.nextUrl.searchParams.get('ids') ?? '';
    const applicationIds = idsRaw
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 8);

    if (!Number.isFinite(teamId) || applicationIds.length === 0) {
      return NextResponse.json(
        { error: 'Provide teamId and ids query (comma-separated).' },
        { status: 400 },
      );
    }

    if (!(await canUserAccessTeamStage(user, teamId, 'deliberations'))) {
      return forbidden('Deliberations are not open for you yet.');
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
    console.error('GET /api/team/deliberations/details failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
