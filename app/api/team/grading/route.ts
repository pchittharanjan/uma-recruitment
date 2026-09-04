export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { forbidden, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { APPLICATION_GRADER_ROLES } from '@/lib/roles';
import { runWithRequestCache } from '@/lib/request-cache';
import { buildTeamGradingData } from '@/lib/team-grading-data';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() => handleGet(req));
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: [...APPLICATION_GRADER_ROLES] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    const stageRaw = req.nextUrl.searchParams.get('stage') ?? 'application';

    const result = await buildTeamGradingData(user, teamId, stageRaw);
    if (!result.ok) {
      if (result.status === 403) return forbidden(result.error);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
