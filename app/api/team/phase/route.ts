export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { forbidden, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getRoundStageUnlocks, getGrantedStagesForUser, getInterviewOnlyScope } from '@/lib/stage-access';
import { PIPELINE_PHASES, phaseLabel, UNLOCKABLE_STAGES } from '@/lib/stages';
import { getRecruitmentCycleLabel } from '@/lib/org-recruitment-cycle-server';
import { runWithRequestCache } from '@/lib/request-cache';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() => handleGet(req));
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round.' }, { status: 404 });
    }

    const displayStatus = round.status;
    const [unlocks, granted, interviewOnlyStage, recruitmentCycleLabel] =
      await Promise.all([
        getRoundStageUnlocks(round.id),
        getGrantedStagesForUser(user, teamId),
        getInterviewOnlyScope(user, teamId),
        getRecruitmentCycleLabel(),
      ]);
    const archiveBrowse =
      displayStatus === 'closed' && (granted === 'all' || granted.length > 0);

    return NextResponse.json({
      round: {
        id: round.id,
        label: recruitmentCycleLabel,
        status: displayStatus,
        phaseLabel: phaseLabel(displayStatus),
      },
      phases: PIPELINE_PHASES,
      unlockedStages: archiveBrowse
        ? [...UNLOCKABLE_STAGES]
        : unlocks.map((u) => u.stage),
      grantedStages: archiveBrowse ? 'all' : granted === 'all' ? 'all' : granted,
      interviewOnlyStage: archiveBrowse ? null : interviewOnlyStage,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
