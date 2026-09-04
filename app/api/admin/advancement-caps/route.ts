export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  getOrgOverCapCodePlain,
  isOverCapCodeSet,
  listTeamAdvancementCaps,
  upsertTeamAdvancementCaps,
} from '@/lib/team-advancement-caps';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req, { roles: ['admin'] });
    if (!user) return unauthorized();

    const [teams, overCapCodeSet, overCapCode] = await Promise.all([
      listTeamAdvancementCaps(),
      isOverCapCodeSet(),
      getOrgOverCapCodePlain(),
    ]);
    return NextResponse.json({ teams, overCapCodeSet, overCapCode });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const user = await requireAuth(req, { roles: ['admin'] });
    if (!user) return unauthorized();

    const body = await req.json();
    const teamId = body.teamId as number | undefined;
    if (!teamId || !Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    const updated = await upsertTeamAdvancementCaps(
      teamId,
      {
        applicationCap:
          body.applicationCap === undefined ? undefined : (body.applicationCap as number | null),
        firstRoundCap:
          body.firstRoundCap === undefined ? undefined : (body.firstRoundCap as number | null),
        deliberationsCap:
          body.deliberationsCap === undefined
            ? undefined
            : (body.deliberationsCap as number | null),
        clearApplicationOverCapExtra: Boolean(body.clearApplicationOverCapExtra),
        clearFirstRoundOverCapExtra: Boolean(body.clearFirstRoundOverCapExtra),
        clearDeliberationsOverCapExtra: Boolean(body.clearDeliberationsOverCapExtra),
      },
      user.id,
    );

    return NextResponse.json({ team: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status = message.includes('must be') || message.includes('not found') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
