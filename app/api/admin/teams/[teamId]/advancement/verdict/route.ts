export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { setAdminAdvancementVerdict } from '@/lib/admin-advancement-verdicts';
import { isAdvancementVerdict, type AdvancementVerdict } from '@/lib/advancement-verdict-types';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;

    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const fromStage = parseFromStage(req.nextUrl.searchParams.get('fromStage'));
    const body = await req.json();
    const applicationId = body.applicationId as number | undefined;
    const verdict = parseVerdict(body.verdict);

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

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    await setAdminAdvancementVerdict(
      admin.id,
      teamId,
      round.id,
      applicationId,
      fromStage,
      verdict,
    );

    return NextResponse.json({ success: true, applicationId, verdict });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status = message.includes('not found') ? 404 : message.includes('Invalid') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
