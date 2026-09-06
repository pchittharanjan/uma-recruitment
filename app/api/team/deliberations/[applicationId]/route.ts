export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { forbidden, unauthorized, notFound } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { buildDeliberationsCandidateDetail } from '@/lib/deliberations';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const { applicationId: appIdRaw } = await params;
    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(teamId) || !Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
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

    const detail = await buildDeliberationsCandidateDetail(teamId, round.id, applicationId);
    if (!detail) return notFound('Application not found on this team’s deliberations board.');

    return NextResponse.json({
      detail,
      team: { id: team.id, name: team.name },
    });
  } catch (e) {
    console.error('GET /api/team/deliberations/[applicationId] failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
