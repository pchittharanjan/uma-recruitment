'use client';

import {
  ClipboardListIcon,
  MicIcon,
  UserCheckIcon,
} from 'lucide-react';
import { NavLinkButton } from '@/components/nav-link-button';
import ProgressBar from '@/components/progress-bar';
import { RecruitmentPhaseStepper } from '@/components/recruitment-phase-stepper';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { greetingForName } from '@/lib/greeting';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import type { AssignmentStage, RoundStatus } from '@/lib/db';
import type { UnlockableStage } from '@/lib/stages';
import {
  pastPhaseWorkSummary,
  resolveWorkStatus,
  WORK_STATUS_DISPLAY,
  workCompleteState,
  workEmptyState,
  workItemNoun,
  workStatusBadgeColor,
  yourWorkCardLabel,
} from '@/lib/stages';
import { gradingCompleteGuidance } from '@/lib/next-step-guidance';
import { cn } from '@/lib/utils';

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
          ? 'interviews remaining'
          : 'work';
    return `The team is in ${phase.phaseLabel}. You don't have any ${emptyNoun} yet. Check back when work is assigned to you.`;
  }
  if (scopedSummary.totalPending === 0) {
    const adv = data.advancement;
    const gradingLocked = data.gradingEditLock?.locked ?? false;
    const interviewLocked = data.interviewEditLock?.locked ?? false;
    if (
      adv &&
      !adv.readOnly &&
      adv.submissionStatus == null &&
      ((currentStage === 'application' && !gradingLocked) ||
        (currentStage === 'first_round' && adv.fromStage === 'first_round' && !interviewLocked))
    ) {
      if (adv.isDirector) {
        return currentStage === 'first_round'
          ? `You're done scoring interviews. Next: set color recommendations, then meet with your PMs to decide who advances.`
          : `You're done grading. Next: set color recommendations, then meet with your PMs to decide who advances.`;
      }
      return currentStage === 'first_round'
        ? `You're done scoring interviews. Next: set color recommendations on who should move forward.`
        : `You're done grading. Next: set color recommendations on who should move forward.`;
    }
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
    return `You have ${scopedSummary.totalPending} ${noun} remaining.`;
  }
  return `You have ${scopedSummary.totalPending} items still pending across ${pendingAreas.length} active areas.`;
}

type DashboardNotice = {
  dismissKey: string;
  type: 'info' | 'success' | 'warning';
  message: string;
  actionLabel?: string;
  actionHref?: string;
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
        message: `Advancement list submitted (${adv.topN} applicant${adv.topN === 1 ? '' : 's'}). Awaiting Admin approval. Scores are locked.`,
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
  } else {
    const appWork = data.work.find((w) => w.stage === 'application');
    const interviewWork = data.work.find((w) => w.stage === 'first_round');
    const personalGradingDone =
      adv?.fromStage === 'application' &&
      appWork != null &&
      appWork.progress.total > 0 &&
      appWork.pendingCount === 0 &&
      !adv.readOnly &&
      !(lock?.locked);
    const personalInterviewsDone =
      adv?.fromStage === 'first_round' &&
      interviewWork != null &&
      interviewWork.progress.total > 0 &&
      interviewWork.pendingCount === 0 &&
      !adv.readOnly &&
      !(data.interviewEditLock?.locked);

    if (personalGradingDone || personalInterviewsDone) {
      const guide = gradingCompleteGuidance(adv!.isDirector);
      notices.push({
        dismissKey: `${prefix}:${personalInterviewsDone ? 'interview' : 'grading'}-next-recommendations`,
        type: 'info',
        message: adv!.isDirector
          ? personalInterviewsDone
            ? 'Interviews scored. Next: set color recommendations, then meet with your PMs to decide who advances.'
            : 'Grading done. Next: set color recommendations, then meet with your PMs to decide who advances.'
          : personalInterviewsDone
            ? 'Interviews scored. Next: set color recommendations on who you think should move forward.'
            : 'Grading done. Next: set color recommendations on who you think should move forward.',
        actionLabel: guide.ctaLabel,
        actionHref: adv!.href,
      });
    }

    if (adv && adv.incompleteCount > 0) {
      const count = adv.incompleteCount;
      const noun =
        adv.fromStage === 'application'
          ? count === 1
            ? 'application'
            : 'applications'
          : count === 1
            ? 'interview'
            : 'interviews';
      notices.push({
        dismissKey: `${prefix}:advancement-incomplete`,
        type: 'warning',
        message: `${count} ${noun} remaining before Directors can submit the advancement list.`,
      });
    }
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
  const gradingLocked = data.gradingEditLock?.locked ?? false;
  const interviewLocked = data.interviewEditLock?.locked ?? false;
  const notices = dashboardNotices(data, teamId);
  const currentWorkStage = workStageForPhase(data.phase.status);
  const statsCardLabel = currentWorkStage
    ? yourWorkCardLabel(currentWorkStage)
    : 'Your work';

  // Keep the header stats scoped to the current phase, so they don't mix
  // "application" completion with "first_round" pending (which looks like
  // the user finished interviews when they're actually still pending).
  const scopedWork = currentWorkStage
    ? data.work.filter((w) => w.stage === currentWorkStage)
    : data.work;
  const totalPending = scopedWork.reduce((sum, w) => sum + w.pendingCount, 0);
  const totalAssigned = scopedWork.reduce((sum, w) => sum + w.progress.total, 0);
  const totalCompleted = totalAssigned - totalPending;

  return (
    <PageContainer>
      <PageSection className="space-y-5">
      <PageHeader
        eyebrow={`${data.round.label} · ${data.team.name}`}
        title={greetingForName(data.user.name)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge label={data.phase.phaseLabel} color="blue" size="compact" />
            {hasMultipleTeams && (
              <NavLinkButton variant="secondary" href="/team">
                ← Teams
              </NavLinkButton>
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
              actionLabel={notice.actionLabel}
              actionHref={notice.actionHref}
            />
          ))}
        </div>
      )}

      {totalAssigned > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-heading text-base font-medium text-foreground">
              Your Current Progress
            </p>
            <p className="font-heading text-xs text-muted-foreground tabular-nums">
              {totalCompleted} of {totalAssigned} complete
              {totalPending > 0 ? ` · ${totalPending} pending` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: statsCardLabel, value: totalAssigned, accent: false },
              { label: 'Completed', value: totalCompleted, accent: false },
              { label: 'Pending', value: totalPending, accent: totalPending > 0 },
            ].map(({ label, value, accent }) => (
              <Card key={label} className={cn('gap-0 py-0', accent && 'border border-primary/20')}>
                <CardContent className="flex flex-col gap-1 px-5 py-4">
                  <p className="font-heading text-base font-medium">{label}</p>
                  <p className={cn('font-heading text-2xl font-medium tracking-tight tabular-nums', accent && 'text-primary')}>
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="font-heading text-base font-medium text-foreground">Your Work</p>
        {data.work.length > 0 ? (
          <div className="space-y-3">
            {data.work.map((area) => {
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
                  : `${area.pendingCount} of ${area.progress.total} ${workItemNoun(area.stage, area.progress.total)} remaining`;
            const showProgress = userHadWork;
            const showPendingDetails = !area.phaseComplete && userHadWork;
            const showPhaseSummary = !showProgress;
            const showBottomCta =
              (allDone &&
                area.stage === 'application' &&
                Boolean(data.advancement) &&
                !data.advancement!.readOnly &&
                !gradingLocked &&
                data.advancement!.submissionStatus == null) ||
              (allDone &&
                area.stage === 'first_round' &&
                data.advancement?.fromStage === 'first_round' &&
                !data.advancement.readOnly &&
                !interviewLocked &&
                data.advancement.submissionStatus == null) ||
              Boolean(
                area.gradeHref &&
                  area.pendingCount > 0 &&
                  !(area.stage === 'application' && gradingLocked) &&
                  !(isFirstRound && interviewLocked),
              );
            const workStatus = area.phaseComplete
              ? ('completed' as const)
              : resolveWorkStatus(area.pendingCount, area.progress.total);
            const badgeStatus = workStatus ?? 'not_started';

            return (
              <Card key={area.stage} className="pt-3 pb-4">
                {/* Header row — icon + title/desc on left, badge (+ View All when no work details) on right */}
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{area.stageLabel}</CardTitle>
                    </div>
                    <StageBadge
                      label={WORK_STATUS_DISPLAY[badgeStatus]}
                      color={workStatusBadgeColor(badgeStatus)}
                      size="compact"
                    />
                    {!showPendingDetails && userHadWork && (
                      <NavLinkButton variant="secondary" size="sm" href={area.href}>
                        View all
                      </NavLinkButton>
                    )}
                  </div>
                  {showPhaseSummary && (
                    <CardDescription className="pl-11">{areaDescription}</CardDescription>
                  )}
                </CardHeader>

                {showProgress && (
                  <CardContent
                    className={cn(
                      'space-y-3 pt-0',
                    )}
                  >
                    <ProgressBar value={area.progress.completed} max={area.progress.total} />

                    {showPendingDetails && area.recentPending.length > 0 && (
                      <div className="space-y-2">
                        {area.upcomingScheduledAt && (
                      <p className="mt-2 mb-3 text-sm text-muted-foreground">
                            Next:{' '}
                            <span className="font-medium text-foreground">
                              {formatSlotTime(area.upcomingScheduledAt)}
                            </span>
                          </p>
                        )}
                        <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-background/60">
                          {area.recentPending.map((item) => (
                            <li
                              key={item.applicationId}
                              className="uma-hover-on-nested flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                              <span className="min-w-0 truncate text-sm text-foreground">{item.label}</span>
                              {item.scheduledAt && (
                                <span className="shrink-0 text-sm text-muted-foreground">
                                  {formatSlotTime(item.scheduledAt)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action buttons inline at bottom of content — no border-top strip */}
                    {(showPendingDetails || showBottomCta) && (
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                        {showPendingDetails && (
                          <NavLinkButton variant="secondary" size="sm" href={area.href}>
                            View all
                          </NavLinkButton>
                        )}
                        {allDone &&
                          area.stage === 'application' &&
                          data.advancement &&
                          !data.advancement.readOnly &&
                          !gradingLocked &&
                          data.advancement.submissionStatus == null && (
                            <NavLinkButton size="sm" href={data.advancement.href}>
                              {gradingCompleteGuidance(data.advancement.isDirector).ctaLabel}
                            </NavLinkButton>
                          )}
                        {allDone &&
                          area.stage === 'first_round' &&
                          data.advancement?.fromStage === 'first_round' &&
                          !data.advancement.readOnly &&
                          !interviewLocked &&
                          data.advancement.submissionStatus == null && (
                            <NavLinkButton size="sm" href={data.advancement.href}>
                              {gradingCompleteGuidance(data.advancement.isDirector).ctaLabel}
                            </NavLinkButton>
                          )}
                        {area.gradeHref &&
                          area.pendingCount > 0 &&
                          !(area.stage === 'application' && gradingLocked) &&
                          !(isFirstRound && interviewLocked) && (
                            <NavLinkButton className="uma-cta-primary" size="sm" href={area.gradeHref}>
                              {area.progress.completed === 0 ? 'Start' : 'Continue'} →
                            </NavLinkButton>
                          )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
            })}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Active Work</CardTitle>
              <CardDescription>
                You don&apos;t have access to any open phases for this team yet, or nothing has
                been assigned to you.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <p className="font-heading text-base font-medium text-foreground">Recruitment Phases</p>
        <Card>
          <CardContent>
            <RecruitmentPhaseStepper
              currentStatus={data.phase.status}
              unlockedStages={data.phase.unlockedStages}
              mode="viewer"
            />
          </CardContent>
        </Card>
      </div>
      </PageSection>
    </PageContainer>
  );
}
