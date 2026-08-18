import 'server-only';

import { userHasTeamAccess } from '@/lib/access';
import { applicantDisplayId } from '@/lib/blind';
import {
  getAdvancementPreview,
  getGradingEditLock,
  getLatestAdvancementSubmission,
  isAdvancementReadOnly,
  type AdvancementFromStage,
} from '@/lib/advancement-submissions';
import { isTeamDirector } from '@/lib/directors';
import { getTeamById, type AssignmentStage, type RoundStatus, type User } from '@/lib/db';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  canUserAccessTeamStage,
  getGrantedStagesForUser,
  getInterviewOnlyScope,
  getRoundStageUnlocks,
} from '@/lib/stage-access';
import { assignmentStageLabel, phaseLabel, statusIndex, UNLOCKABLE_STAGES } from '@/lib/stages';
import { getRecruitmentCycleLabel } from '@/lib/org-recruitment-cycle-server';
import { getTeamStageProgress, listGraderAssignments } from '@/lib/team-dashboard';

const WORK_STAGES: AssignmentStage[] = ['application', 'first_round', 'final_round'];

export type TeamOverviewResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/** Team-portal home payload — shared by the overview API route and the server-rendered page. */
export async function buildTeamOverview(user: User, teamId: number): Promise<TeamOverviewResult> {
  if (!(await userHasTeamAccess(user, teamId))) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  const round = await getActiveRoundForTeam(teamId);
  if (!round) {
    return { ok: false, status: 404, error: 'No active round for this team.' };
  }

  const displayStatus = round.status;
  const [unlocks, granted, interviewOnlyStage] = await Promise.all([
    getRoundStageUnlocks(round.id),
    getGrantedStagesForUser(user, teamId),
    getInterviewOnlyScope(user, teamId),
  ]);
  const archiveBrowse =
    displayStatus === 'closed' && (granted === 'all' || granted.length > 0);
  const unlockedStages = archiveBrowse
    ? [...UNLOCKABLE_STAGES]
    : unlocks.map((u) => u.stage);
  const grantedStages = archiveBrowse ? ('all' as const) : granted === 'all' ? ('all' as const) : granted;

  const [team, gradingEditLock, interviewEditLock] = await Promise.all([
    getTeamById(teamId),
    getGradingEditLock(teamId, round.id, 'application'),
    getGradingEditLock(teamId, round.id, 'first_round'),
  ]);

  const workByStage = await Promise.all(
    WORK_STAGES.map(async (stage) => {
      if (!(await canUserAccessTeamStage(user, teamId, stage))) return null;

      const phaseComplete = statusIndex(displayStatus) > statusIndex(stage as RoundStatus);
      const [assignments, teamProgress] = await Promise.all([
        listGraderAssignments(user.id, teamId, stage),
        phaseComplete ? getTeamStageProgress(teamId, round.id, stage) : Promise.resolve(null),
      ]);
      const completed = assignments.filter((a) => a.status === 'completed').length;
      const pending = assignments.filter((a) => a.status === 'pending');
      const firstPending = pending[0] ?? null;

      const upcomingInterview =
        stage !== 'application'
          ? pending.find((a) => a.scheduledAt)?.scheduledAt ?? null
          : null;

      return {
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
      };
    }),
  );
  const work = workByStage.filter((w) => w !== null);

  let advancement = null;
  let isDirector = false;
  if (user.role === 'exec') {
    let fromStage: AdvancementFromStage | null = null;
    if (displayStatus === 'application') {
      fromStage = 'application';
    } else if (
      displayStatus === 'first_round' ||
      statusIndex(displayStatus) > statusIndex('first_round')
    ) {
      fromStage = 'first_round';
    }

    isDirector = await isTeamDirector(user.id, teamId);
    if (fromStage) {
      const [preview, submission] = await Promise.all([
        getAdvancementPreview(teamId, round.id, fromStage),
        getLatestAdvancementSubmission(teamId, round.id, fromStage),
      ]);
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

  return {
    ok: true,
    data: {
      team: { id: teamId, name: team?.name ?? `Team ${teamId}` },
      round: { id: round.id, label: recruitmentCycleLabel },
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      phase: {
        status: displayStatus,
        phaseLabel: phaseLabel(displayStatus),
        unlockedStages,
        grantedStages,
        interviewOnlyStage: archiveBrowse ? null : interviewOnlyStage,
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
    },
  };
}
