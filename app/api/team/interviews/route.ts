export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, type AssignmentStage } from '@/lib/db';
import { forbidden, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { runWithRequestCache } from '@/lib/request-cache';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { listGraderAssignments } from '@/lib/team-dashboard';
import { assignmentStageLabel } from '@/lib/stages';

const ASSIGNMENT_STAGES: AssignmentStage[] = ['application', 'first_round', 'final_round'];

export async function GET(req: NextRequest) {
  return runWithRequestCache(() => handleGet(req));
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    const stageRaw = req.nextUrl.searchParams.get('stage') ?? 'application';
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (!ASSIGNMENT_STAGES.includes(stageRaw as AssignmentStage)) {
      return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
    }
    const stage = stageRaw as AssignmentStage;

    if (!(await canUserAccessTeamStage(user, teamId, stage))) {
      return forbidden('This stage is not open for you yet.');
    }

    const assignments = await listGraderAssignments(user.id, teamId, stage);
    const completed = assignments.filter((a) => a.status === 'completed').length;

    return NextResponse.json({
      grader: { id: user.id, name: user.name, email: user.email },
      stage,
      stageLabel: assignmentStageLabel(stage),
      assignments,
      progress: { completed, total: assignments.length },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
