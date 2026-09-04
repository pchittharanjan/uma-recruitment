'use client';

import { NavLinkButton } from '@/components/nav-link-button';
import ProgressBar from '@/components/progress-bar';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useShellUser } from '@/components/shell-user-provider';
import { applicantDisplayId } from '@/lib/blind';
import { GradingEditControl } from '@/components/grading-edit-control';
import { gradingCompleteGuidance } from '@/lib/next-step-guidance';
import {
  gradingBackHref,
  gradingAppHref,
  type GradingAudience,
} from '@/lib/grading-paths';
import {
  assignmentWorkStatus,
  WORK_STATUS_DISPLAY,
  workStatusBadgeColor,
} from '@/lib/stages';
import { ClipboardListIcon } from 'lucide-react';
import type { TeamGradingData } from '@/lib/team-grading-types';

export function TeamGradingQueue({
  teamId,
  data,
  accessError,
  audience = 'team',
  teamName: teamNameProp,
}: {
  teamId: string;
  data: TeamGradingData | null;
  accessError?: string;
  audience?: GradingAudience;
  teamName?: string;
}) {
  const { teams } = useShellUser();
  const teamName = teamNameProp || teams.find((t) => String(t.id) === teamId)?.name || '';
  const isAdmin = audience === 'admin' || data?.isAdminGrader;
  const gradingAudience: GradingAudience = isAdmin ? 'admin' : 'team';
  const backHref = gradingBackHref(teamId, gradingAudience);

  if (accessError && !data) {
    return (
      <CenteredMessage
        title="Can't open grading"
        description={accessError}
        ctaLabel={isAdmin ? '← Back to team' : '← Team Overview'}
        ctaHref={backHref}
      />
    );
  }

  if (!data) return null;

  const firstPending = data.assignments.find((a) => a.status === 'pending');
  const allDone = data.progress.completed === data.progress.total && data.progress.total > 0;
  const gradingLocked = data.gradingEditLock?.locked ?? false;
  const lockMessage = data.gradingEditLock?.message ?? '';
  const nextStep = data.nextStep;
  const completeCopy = nextStep ? gradingCompleteGuidance(nextStep.isDirector) : null;

  if (data.assignments.length === 0) {
    return (
      <CenteredMessage
        icon={ClipboardListIcon}
        title="No applications assigned"
        description={
          isAdmin
            ? 'Add yourself as a grader during import, or move leftover apps to yourself on Review assignments. This queue is name-blind — the spreadsheet still shows names.'
            : "Nothing to grade yet. You'll see applicants here once an admin imports and assigns them to you."
        }
        ctaLabel={isAdmin ? '← Back to team' : '← Overview'}
        ctaHref={backHref}
      />
    );
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={teamName || (isAdmin ? 'Admin' : 'Your team')}
        title="Application Grading"
        description={
          completeCopy
            ? undefined
            : allDone
              ? undefined
              : isAdmin
                ? 'Score each assigned application. Names and identifying fields are hidden here.'
                : 'Score each assigned application. Names are hidden during application grading — that is intentional. When you finish, you will rate who should advance using five color ratings (Green → Red).'
        }
        actions={
          <NavLinkButton variant="secondary" href={backHref} data-tour="grade-overview">
            {isAdmin ? '← Back to team' : '← Overview'}
          </NavLinkButton>
        }
      />

      {gradingLocked && <StatusBanner type="info" message={lockMessage} />}

      <PageSection>
        {completeCopy && nextStep && (
          <Card className="gap-4 border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
            <div className="space-y-1">
              <CardTitle className="text-base">{completeCopy.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {completeCopy.description}
              </CardDescription>
            </div>
            <NavLinkButton
              className="w-full sm:w-auto"
              href={nextStep.href}
              data-tour="grade-next-step"
            >
              {completeCopy.ctaLabel}
            </NavLinkButton>
          </Card>
        )}

        {data.isAdHocExec && allDone && (
          <Card className="gap-4 border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
            <div className="space-y-1">
              <CardTitle className="text-base">All applications graded</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                You&apos;re done — no ratings step for your role.
              </CardDescription>
            </div>
            <NavLinkButton className="w-full sm:w-auto" href={backHref}>
              ← Overview
            </NavLinkButton>
          </Card>
        )}

        {isAdmin && allDone && (
          <Card className="gap-4 border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
            <div className="space-y-1">
              <CardTitle className="text-base">All applications graded</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                You&apos;re done grading this queue. Advancement still happens from the team
                dashboard — this view stays name-blind.
              </CardDescription>
            </div>
            <NavLinkButton className="w-full sm:w-auto" href={backHref}>
              ← Back to team
            </NavLinkButton>
          </Card>
        )}

        <Card className="gap-4 p-5 sm:p-6">
          <div data-tour="grade-progress">
            <ProgressBar
              value={data.progress.completed}
              max={data.progress.total}
              label="Applications Graded"
            />
          </div>
          {!allDone && !gradingLocked && firstPending && (
            <NavLinkButton
              className="w-full"
              href={gradingAppHref(teamId, firstPending.applicationId, gradingAudience)}
              data-tour="grade-start"
            >
              {data.progress.completed === 0 ? 'Start grading' : 'Continue grading'} →
            </NavLinkButton>
          )}
        </Card>

        <Card className="overflow-hidden" data-tour="grade-queue">
          <CardHeader>
            <CardTitle>Your Applications</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {data.assignments.map((a) => {
              const workStatus = assignmentWorkStatus(a.status);
              return (
                <div
                  key={a.assignmentId}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 text-sm font-medium">
                    {applicantDisplayId(a.rowIndex)}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <StageBadge
                      label={WORK_STATUS_DISPLAY[workStatus]}
                      color={workStatusBadgeColor(workStatus)}
                      size="compact"
                    />
                    <GradingEditControl
                      teamId={teamId}
                      applicationId={a.applicationId}
                      locked={gradingLocked}
                      lockMessage={lockMessage}
                      audience={gradingAudience}
                      label={a.status === 'completed' ? 'Edit scores' : 'Grade application'}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
