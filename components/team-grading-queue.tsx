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
}: {
  teamId: string;
  data: TeamGradingData | null;
  accessError?: string;
}) {
  const { teams } = useShellUser();
  const teamName = teams.find((t) => String(t.id) === teamId)?.name ?? '';

  if (accessError && !data) {
    return (
      <CenteredMessage
        title="Can't open grading"
        description={accessError}
        ctaLabel="← Team Overview"
        ctaHref={`/team/${teamId}`}
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
        description="Nothing to grade yet. You'll see applicants here once an admin imports and assigns them to you."
        ctaLabel="← Overview"
        ctaHref={`/team/${teamId}`}
      />
    );
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={teamName || 'Your team'}
        title="Application Grading"
        description={
          completeCopy
            ? undefined
            : allDone
              ? undefined
              : 'Score each assigned application. When you finish, you\'ll add color recommendations next.'
        }
        actions={
          <NavLinkButton variant="secondary" href={`/team/${teamId}`}>
            ← Overview
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
            <NavLinkButton className="w-full sm:w-auto" href={nextStep.href}>
              {completeCopy.ctaLabel}
            </NavLinkButton>
          </Card>
        )}

        <Card className="gap-4 p-5 sm:p-6">
          <ProgressBar
            value={data.progress.completed}
            max={data.progress.total}
            label="Applications Graded"
          />
          {!allDone && !gradingLocked && firstPending && (
            <NavLinkButton
              className="w-full"
              href={`/team/${teamId}/grade/${firstPending.applicationId}`}
            >
              {data.progress.completed === 0 ? 'Start grading' : 'Continue grading'} →
            </NavLinkButton>
          )}
        </Card>

        <Card className="overflow-hidden">
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
