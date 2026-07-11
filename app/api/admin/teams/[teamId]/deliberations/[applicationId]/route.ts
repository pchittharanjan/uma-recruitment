export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { buildDeliberationsCandidateDetail } from '@/lib/deliberations';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; applicationId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw, applicationId: appIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(teamId) || !Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const detail = await buildDeliberationsCandidateDetail(teamId, round.id, applicationId);
    if (!detail) return notFound('Application not found on this team’s deliberations board.');

    return NextResponse.json({ detail });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/deliberations/[applicationId] failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
