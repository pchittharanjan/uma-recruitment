export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getAdminAdvancementWorkspace } from '@/lib/advancement-admin';
import { submitAdminTeamAdvancement } from '@/lib/advancement-submissions';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

const VALID_FROM_STAGES: AdvancementFromStage[] = ['application', 'first_round'];

function parseFromStage(
  param: string | null,
  roundStatus: string,
): AdvancementFromStage | null {
  if (param === 'application' || param === 'first_round') return param;
  if (roundStatus === 'application') return 'application';
  if (roundStatus === 'first_round') return 'first_round';
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const fromStage = parseFromStage(req.nextUrl.searchParams.get('fromStage'), round.status);
    if (!fromStage || !VALID_FROM_STAGES.includes(fromStage)) {
      return NextResponse.json(
        {
          error:
            'Advancement workspace is only available during application or first round. Pass ?fromStage=application or ?fromStage=first_round.',
        },
        { status: 400 },
      );
    }

    const workspace = await getAdminAdvancementWorkspace(admin, teamId, fromStage);
    return NextResponse.json({ team, ...workspace });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/advancement failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

    const body = await req.json();
    const fromStage: AdvancementFromStage =
      body.fromStage === 'first_round' ? 'first_round' : 'application';
    const applicationIds = body.applicationIds as number[] | undefined;
    const autoApprove = body.autoApprove !== false;
    const force = body.force !== false;

    if (
      !applicationIds ||
      !Array.isArray(applicationIds) ||
      !applicationIds.every((id) => typeof id === 'number' && Number.isFinite(id))
    ) {
      return NextResponse.json({ error: 'applicationIds must contain valid numbers.' }, { status: 400 });
    }

    const submission = await submitAdminTeamAdvancement(
      admin,
      teamId,
      fromStage,
      applicationIds,
      { autoApprove, force },
    );

    return NextResponse.json({ success: true, submission, autoApprove });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('already been approved') ||
      message.includes('not configured') ||
      message.includes('Select') ||
      message.includes('Duplicate') ||
      message.includes('invalid') ||
      message.includes('during the') ||
      message.includes('still need') ||
      message.includes('still need')
        ? 400
        : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
