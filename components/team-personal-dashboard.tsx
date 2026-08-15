'use client';

import { useRouter } from 'next/navigation';
import {
  ClipboardListIcon,
  MicIcon,
  UserCheckIcon,
} from 'lucide-react';
import LoadingButton from '@/components/loading-button';
import ProgressBar from '@/components/progress-bar';
import { RecruitmentPhaseStepper } from '@/components/recruitment-phase-stepper';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import type { AssignmentStage, RoundStatus } from '@/lib/db';
import type { UnlockableStage } from '@/lib/stages';
import {
  pastPhaseWorkSummary,
  pendingWorkLabel,
  resolveWorkStatus,
  WORK_STATUS_DISPLAY,
  workActionVerb,
  workCompleteState,
  workEmptyState,
  workItemNoun,
  workStatusBadgeColor,
  yourWorkCardLabel,
} from '@/lib/stages';

function workStageForPhase(status: RoundStatus): AssignmentStage | null {
  if (status === 'application' || status === 'first_round' || status === 'final_round') {
    return status;
  }
  return null;
}

export interface TeamOverviewWork {
  stage: AssignmentStage;
  stageLabel: string;
  progress: { completed: number; total: number };
  pendingCount: number;
  phaseComplete: boolean;
  teamProgress: { completed: number; total: number } | null;
  firstPendingApplicationId: number | null;
  upcomingScheduledAt: string | null;
  recentPending: Array<{
    applicationId: number;
    rowIndex: number;
    displayId: string;
    label: string;
    scheduledAt: string | null;
    location: string | null;
  }>;
  href: string;
  gradeHref: string | null;
}

export interface TeamOverviewData {
  team: { id: number; name: string };
  round: { id: number; label: string };
  user: { id: number; name: string; email: string; role: string };
  phase: {
    status: RoundStatus;
    phaseLabel: string;
    unlockedStages: UnlockableStage[];
    grantedStages: UnlockableStage[] | 'all';
    interviewOnlyStage: AssignmentStage | null;
  };
  work: TeamOverviewWork[];
  summary: { totalPending: number; totalAssigned: number; totalCompleted: number };
  gradingEditLock: GradingEditLock;
  advancement: {
    fromStage: 'application' | 'first_round';
    incompleteCount: number;
    totalApplications: number;
    submissionStatus: 'submitted' | 'approved' | null;
    topN: number | null;
    readOnly: boolean;
    href: string;
    isDirector: boolean;
  } | null;
  isExec: boolean;
  interviewEditLock?: GradingEditLock;
}

const STAGE_ICONS: Partial<Record<AssignmentStage, typeof ClipboardListIcon>> = {
  application: ClipboardListIcon,
  first_round: MicIcon,
  final_round: UserCheckIcon,
};

function formatSlotTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function personalSummary(data: TeamOverviewData): string {
  const { summary, work, phase } = data;
  const currentStage = workStageForPhase(phase.status);
  const scopedWork = currentStage ? work.filter((w) => w.stage === currentStage) : work;
  const scopedSummary =
    currentStage && scopedWork.length > 0
      ? {
          totalPending: scopedWork.reduce((sum, w) => sum + w.pendingCount, 0),
          totalAssigned: scopedWork.reduce((sum, w) => sum + w.progress.total, 0),
        }
      : { totalPending: summary.totalPending, totalAssigned: summary.totalAssigned };

  if (scopedSummary.totalAssigned === 0) {
    const emptyNoun =
      currentStage === 'application'
        ? 'applications to grade'
        : currentStage === 'first_round' || currentStage === 'final_round'
          ? 'interviews to score'
          : 'work';
    return `The team is in ${phase.phaseLabel}. You don't have any ${emptyNoun} yet — check back when work is assigned to you.`;
  }
  if (scopedSummary.totalPending === 0) {
    const noun = currentStage
      ? workItemNoun(currentStage, scopedSummary.totalAssigned)
      : scopedSummary.totalAssigned === 1
        ? 'item'
        : 'items';
    return `You're caught up on all ${scopedSummary.totalAssigned} ${noun}.`;
  }
  const pendingAreas = scopedWork.filter((w) => w.pendingCount > 0);
  if (pendingAreas.length === 1) {
    const area = pendingAreas[0];
    const noun = workItemNoun(area.stage, scopedSummary.totalPending);
    const verb = workActionVerb(area.stage);
    return `You have ${scopedSummary.totalPending} ${noun} still to ${verb}.`;
  }
  return `You have ${scopedSummary.totalPending} items still pending across ${pendingAreas.length} active areas.`;
}

type DashboardNotice = {
  dismissKey: string;
  type: 'info' | 'success' | 'warning';
  message: string;
};

function dashboardNotices(data: TeamOverviewData, teamId: string): DashboardNotice[] {
  const adv = data.advancement;
  const lock = data.gradingEditLock;
  const prefix = `uma-notice:${data.user.id}:${teamId}`;

  if (adv?.submissionStatus === 'approved' && lock?.locked && lock.reason === 'approved') {
    return [
      {
        dismissKey: `${prefix}:advancement-approved`,
        type: 'success',
        message: `Advancement list approved (${adv.topN} applicant${adv.topN === 1 ? '' : 's'}). Scores and comments are locked.`,
      },
    ];
  }

  if (adv?.submissionStatus === 'submitted' && lock?.locked && lock.reason === 'submitted') {
    return [
      {
        dismissKey: `${prefix}:advancement-submitted`,
        type: 'info',
        message: `Advancement list submitted (${adv.topN} applicant${adv.topN === 1 ? '' : 's'}). Awaiting Admin approval — scores are locked.`,
      },
    ];
  }

  const notices: DashboardNotice[] = [];

  if (lock?.locked && lock.message) {
    notices.push({
      dismissKey: `${prefix}:grading-lock-${lock.reason ?? 'unknown'}`,
      type: 'info',
      message: lock.message,
    });
  }

  if (adv?.submissionStatus === 'approved') {
    notices.push({
      dismissKey: `${prefix}:advancement-approved`,
      type: 'success',
      message: `Advancement list approved (${adv.topN} applicant${adv.topN === 1 ? '' : 's'}).`,
    });
  } else if (adv?.submissionStatus === 'submitted') {
    notices.push({
      dismissKey: `${prefix}:advancement-submitted`,
      type: 'info',
      message: `Advancement list (${adv.topN} applicant${adv.topN === 1 ? '' : 's'}) is waiting for Admin approval.`,
    });
  } else if (adv && adv.incompleteCount > 0) {
    const pendingLabel = pendingWorkLabel(adv.fromStage);
    notices.push({
      dismissKey: `${prefix}:advancement-incomplete`,
      type: 'warning',
      message: `${adv.incompleteCount} ${pendingLabel}${adv.incompleteCount === 1 ? '' : 's'} still pending before Directors can submit the advancement list.`,
    });
  }

  return notices;
}

export function TeamPersonalDashboard({
  data,
  teamId,
  hasMultipleTeams,
}: {
  data: TeamOverviewData;
  teamId: string;
  hasMultipleTeams: boolean;
}) {
  const router = useRouter();
  const gradingLocked = data.gradingEditLock?.locked ?? false;
  const interviewLocked = data.interviewEditLock?.locked ?? false;
  const notices = dashboardNotices(data, teamId);
  const currentWorkStage = workStageForPhase(data.phase.status);
  const statsCardLabel = currentWorkStage
    ? yourWorkCardLabel(currentWorkStage)
    : 'Your work';

  return (
    <PageContainer>
      <PageSection>
      <PageHeader
        eyebrow={data.round.label}
        title={data.team.name}
        description={personalSummary(data)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge label={data.phase.phaseLabel} color="blue" />
            {hasMultipleTeams && (
              <LoadingButton variant="secondary" onClick={() => router.push('/team')}>
                ← Teams
              </LoadingButton>
            )}
          </div>
        }
      />

      {notices.length > 0 && (
        <div className="space-y-2">
          {notices.map((notice) => (
            <StatusBanner
              key={notice.dismissKey}
              type={notice.type}
              message={notice.message}
              dismissKey={notice.dismissKey}
            />
          ))}
        </div>
      )}

      {data.summary.totalAssigned > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="bg-linear-to-t from-primary/5 to-card">
            <CardHeader className="pb-2">
              <CardDescription>{statsCardLabel}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {data.summary.totalAssigned}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-linear-to-t from-primary/5 to-card">
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {data.summary.totalCompleted}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-linear-to-t from-primary/5 to-card">
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {data.summary.totalPending}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="space-y-4">
        {data.work.length > 0 ? (
          data.work.map((area) => {
            const Icon = STAGE_ICONS[area.stage] ?? ClipboardListIcon;
            const allDone = area.progress.total > 0 && area.pendingCount === 0;
            const isFirstRound = area.stage === 'first_round';
            const userHadWork = area.progress.total > 0;
            const teamProgress = area.teamProgress ?? { completed: 0, total: 0 };
            const areaDescription = area.phaseComplete
              ? pastPhaseWorkSummary(
                  area.stage,
                  area.progress.completed,
                  area.progress.total,
                  teamProgress.completed,
                  teamProgress.total,
                )
              : area.progress.total === 0
                ? workEmptyState(area.stage)
                : allDone
                  ? workCompleteState(area.stage)
                  : `${area.pendingCount} of ${area.progress.total} ${workItemNoun(area.stage, area.progress.total)} still to ${workActionVerb(area.stage)}`;
            const showWorkDetails = !area.phaseComplete && userHadWork;
            const showFooter = userHadWork;
            const workStatus = area.phaseComplete
              ? ('completed' as const)
              : resolveWorkStatus(area.pendingCount, area.progress.total);

            return (
              <Card key={area.stage}>
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border/50">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base">{area.stageLabel}</CardTitle>
                        <CardDescription className="mt-1">{areaDescription}</CardDescription>
                      </div>
                    </div>
                    {workStatus && (
                      <StageBadge
                        label={WORK_STATUS_DISPLAY[workStatus]}
                        color={workStatusBadgeColor(workStatus)}
                      />
                    )}
                  </div>
                </CardHeader>

                {showWorkDetails && (
                  <CardContent className="space-y-4 border-t border-border/60 pt-5">
                    <ProgressBar
                      value={area.progress.completed}
                      max={area.progress.total}
                      label="Your progress"
                    />

                    {area.upcomingScheduledAt && (
                      <p className="text-sm text-muted-foreground">
                        Next interview:{' '}
                        <span className="font-medium text-foreground">
                          {formatSlotTime(area.upcomingScheduledAt)}
                        </span>
                      </p>
                    )}

                    {area.recentPending.length > 0 && (
                      <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                        {area.recentPending.map((item) => (
                          <li
                            key={item.applicationId}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                          >
                            <span className="min-w-0 truncate font-medium">{item.label}</span>
                            {item.scheduledAt && (
                              <span className="shrink-0 text-sm text-muted-foreground">
                                {formatSlotTime(item.scheduledAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                )}

                {showFooter && (
                  <CardFooter className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
                    {userHadWork && (
                      <LoadingButton variant="secondary" onClick={() => router.push(area.href)}>
                        View all
                      </LoadingButton>
                    )}
                    {showWorkDetails &&
                      area.gradeHref &&
                      area.pendingCount > 0 &&
                      !(area.stage === 'application' && gradingLocked) &&
                      !(isFirstRound && interviewLocked) && (
                        <LoadingButton onClick={() => router.push(area.gradeHref!)}>
                          {area.progress.completed === 0 ? 'Start' : 'Continue'} →
                        </LoadingButton>
                      )}
                  </CardFooter>
                )}
              </Card>
            );
          })
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No active work</CardTitle>
              <CardDescription>
                You don&apos;t have access to any open phases for this team yet, or nothing has
                been assigned to you.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card className="bg-muted/25">
        <CardHeader>
          <CardTitle className="text-base">Recruitment phases</CardTitle>
        </CardHeader>
        <CardContent>
          <RecruitmentPhaseStepper
            currentStatus={data.phase.status}
            unlockedStages={data.phase.unlockedStages}
            mode="viewer"
          />
        </CardContent>
      </Card>
      </PageSection>
    </PageContainer>
  );
}
