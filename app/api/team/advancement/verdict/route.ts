export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import {
  isAdvancementVerdict,
  setAssignmentAdvancementVerdict,
  type AdvancementVerdict,
} from '@/lib/advancement-verdicts';
import { forbidden, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { userHasTeamAccess } from '@/lib/access';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

function parseFromStage(value: string | null): AdvancementFromStage {
  return value === 'first_round' ? 'first_round' : 'application';
}

function parseVerdict(value: unknown): AdvancementVerdict | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' && isAdvancementVerdict(value)) return value;
  return undefined;
}

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const fromStage = parseFromStage(req.nextUrl.searchParams.get('fromStage'));
    const allowedRoles =
      fromStage === 'first_round' ? (['exec', 'ad_hoc_exec'] as const) : (['exec'] as const);
    const user = await requireTeamPortalUser(req, { roles: [...allowedRoles] });
    if (!user) return unauthorized();

    const body = await req.json();
    const teamId = body.teamId as number | undefined;
    const applicationId = body.applicationId as number | undefined;
    const verdict = parseVerdict(body.verdict);

    if (!teamId || !Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (!applicationId || !Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'applicationId is required.' }, { status: 400 });
    }
    if (verdict === undefined) {
      return NextResponse.json(
        {
          error:
            'verdict must be green, high_yellow, yellow, low_yellow, red, or null.',
        },
        { status: 400 },
      );
    }

    if (!(await userHasTeamAccess(user, teamId))) return forbidden();

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    await setAssignmentAdvancementVerdict(
      user.id,
      teamId,
      round.id,
      applicationId,
      fromStage,
      verdict,
    );

    return NextResponse.json({ success: true, applicationId, verdict });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('not assigned') || message.includes('access')
        ? 403
        : message.includes('Complete your review')
          ? 400
          : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
