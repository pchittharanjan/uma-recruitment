export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { userHasTeamAccess } from '@/lib/access';
import { applicantDisplayId } from '@/lib/blind';
import {
  getAdvancementPreview,
  getGradingEditLock,
  getLatestAdvancementSubmission,
  isAdvancementReadOnly,
  type AdvancementFromStage,
} from '@/lib/advancement-submissions';
import { forbidden, unauthorized } from '@/lib/auth';
import { isTeamDirector } from '@/lib/directors';
import { getTeamById, initDb, type AssignmentStage, type RoundStatus } from '@/lib/db';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  canUserAccessTeamStage,
  getGrantedStagesForUser,
  getInterviewOnlyScope,
  getRoundStageUnlocks,
} from '@/lib/stage-access';
import { assignmentStageLabel, phaseLabel, statusIndex } from '@/lib/stages';
import { getRecruitmentCycleLabel } from '@/lib/org-recruitment-cycle-server';
import { getTeamStageProgress, listGraderAssignments } from '@/lib/team-dashboard';

const WORK_STAGES: AssignmentStage[] = ['application', 'first_round', 'final_round'];

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (!(await userHasTeamAccess(user, teamId))) return forbidden();

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const globalState = await getGlobalPipelineState();
    const displayStatus = round.status;
    const unlocks = await getRoundStageUnlocks(round.id);
    const granted = await getGrantedStagesForUser(user, teamId);
    const interviewOnlyStage = await getInterviewOnlyScope(user, teamId);
    const unlockedStages =
      globalState.unlockedStages.length > 0
        ? globalState.unlockedStages
        : unlocks.map((u) => u.stage);

    const team = await getTeamById(teamId);
    const gradingEditLock = await getGradingEditLock(teamId, round.id, 'application');
    const interviewEditLock = await getGradingEditLock(teamId, round.id, 'first_round');

    const work = [];
    for (const stage of WORK_STAGES) {
      if (!(await canUserAccessTeamStage(user, teamId, stage))) continue;

      const assignments = await listGraderAssignments(user.id, teamId, stage);
      const completed = assignments.filter((a) => a.status === 'completed').length;
      const pending = assignments.filter((a) => a.status === 'pending');
      const firstPending = pending[0] ?? null;

      const upcomingInterview =
        stage !== 'application'
          ? pending.find((a) => a.scheduledAt)?.scheduledAt ?? null
          : null;

      const phaseComplete =
        statusIndex(displayStatus) > statusIndex(stage as RoundStatus);
      const teamProgress = phaseComplete
        ? await getTeamStageProgress(teamId, round.id, stage)
        : null;

      work.push({
        stage,
        stageLabel: assignmentStageLabel(stage),
        progress: { completed, total: assignments.length },
        pendingCount: pending.length,
        phaseComplete,
        teamProgress,
        firstPendingApplicationId: firstPending?.applicationId ?? null,
        upcomingScheduledAt: upcomingInterview,
        recentPending: pending.slice(0, 3).map((a) => ({
          applicationId: a.applicationId,
          rowIndex: a.rowIndex,
          displayId: applicantDisplayId(a.rowIndex),
          label:
            stage === 'application'
              ? applicantDisplayId(a.rowIndex)
              : a.candidateName,
          scheduledAt: a.scheduledAt,
          location: a.location,
        })),
        href:
          stage === 'application'
            ? `/team/${teamId}/grade`
            : `/team/${teamId}/interviews/${stage}`,
        gradeHref: firstPending
          ? stage === 'application'
            ? `/team/${teamId}/grade/${firstPending.applicationId}`
            : `/team/${teamId}/interviews/${stage}/${firstPending.applicationId}`
          : null,
      });
    }

    let advancement = null;
    let isDirector = false;
    if (user.role === 'exec') {
      isDirector = await isTeamDirector(user.id, teamId);
      let fromStage: AdvancementFromStage | null = null;
      if (displayStatus === 'application') {
        fromStage = 'application';
      } else if (
        displayStatus === 'first_round' ||
        statusIndex(displayStatus) > statusIndex('first_round')
      ) {
        fromStage = 'first_round';
      }

      if (fromStage) {
        const preview = await getAdvancementPreview(teamId, round.id, fromStage);
        const submission = await getLatestAdvancementSubmission(teamId, round.id, fromStage);
        const readOnly = isAdvancementReadOnly(displayStatus, fromStage);

        advancement = {
          fromStage,
          incompleteCount: preview.incompleteCount,
          totalApplications: preview.totalApplications,
          submissionStatus:
            submission && submission.status !== 'withdrawn' ? submission.status : null,
          topN: submission?.status !== 'withdrawn' ? (submission?.topN ?? null) : null,
          readOnly,
          isDirector,
          href:
            fromStage === 'first_round'
              ? `/team/${teamId}/advancement/first-round`
              : `/team/${teamId}/advancement`,
        };
      }
    }

    const totalPending = work.reduce((sum, w) => sum + w.pendingCount, 0);
    const totalAssigned = work.reduce((sum, w) => sum + w.progress.total, 0);
    const recruitmentCycleLabel = await getRecruitmentCycleLabel();

    return NextResponse.json({
      team: { id: teamId, name: team?.name ?? `Team ${teamId}` },
      round: { id: round.id, label: recruitmentCycleLabel },
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      phase: {
        status: displayStatus,
        phaseLabel: phaseLabel(displayStatus),
        unlockedStages,
        grantedStages: granted === 'all' ? 'all' : granted,
        interviewOnlyStage,
      },
      work,
      summary: {
        totalPending,
        totalAssigned,
        totalCompleted: totalAssigned - totalPending,
      },
      gradingEditLock,
      interviewEditLock,
      advancement,
      isExec: user.role === 'exec',
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
