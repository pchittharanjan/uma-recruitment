export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { forbidden, unauthorized } from '@/lib/auth';
import { userHasTeamAccess } from '@/lib/access';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { isTeamDirector } from '@/lib/directors';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { assertPipelineWritable } from '@/lib/pipeline-writable';
import type { AdvancementCapStage } from '@/lib/team-advancement-caps';
import {
  setTeamOverCapExtra,
  verifyOrgOverCapCode,
} from '@/lib/team-advancement-caps';

function parseStage(value: unknown): AdvancementCapStage | null {
  if (value === 'application' || value === 'first_round' || value === 'deliberations') {
    return value;
  }
  return null;
}

/**
 * Director / exec enters the org go-over code + how many extra slots past the official cap.
 * Does not return the code.
 */
export async function POST(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;

    const body = await req.json();
    const stage = parseStage(body.stage);
    if (!stage) {
      return NextResponse.json(
        { error: 'stage must be application, first_round, or deliberations.' },
        { status: 400 },
      );
    }

    const teamId = Number(body.teamId);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    const code = typeof body.code === 'string' ? body.code : '';
    const extraCount = Number(body.extraCount);
    if (!Number.isInteger(extraCount) || extraCount < 1) {
      return NextResponse.json(
        { error: 'extraCount must be a positive whole number.' },
        { status: 400 },
      );
    }

    const allowedRoles =
      stage === 'deliberations'
        ? (['exec', 'ad_hoc_exec'] as const)
        : stage === 'first_round'
          ? (['exec', 'ad_hoc_exec'] as const)
          : (['exec'] as const);

    const user = await requireTeamPortalUser(req, { roles: [...allowedRoles] });
    if (!user) return unauthorized();

    if (!(await userHasTeamAccess(user, teamId))) return forbidden();

    if (stage === 'deliberations') {
      if (!(await canUserAccessTeamStage(user, teamId, 'deliberations'))) {
        return forbidden('Deliberations are not open for you yet.');
      }
    } else {
      if (user.role !== 'exec' || !(await isTeamDirector(user.id, teamId))) {
        return forbidden('Only team Directors can request going over the advancement limit.');
      }
    }

    const ok = await verifyOrgOverCapCode(code);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid go-over code.' }, { status: 403 });
    }

    const result = await setTeamOverCapExtra(teamId, stage, extraCount, user.id);
    return NextResponse.json({
      success: true,
      teamId,
      stage,
      cap: result.cap,
      overCapExtra: result.overCapExtra,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('positive') || message.includes('not found') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
