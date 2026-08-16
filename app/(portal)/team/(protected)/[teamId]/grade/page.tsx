'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingButton from '@/components/loading-button';
import ProgressBar from '@/components/progress-bar';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useShellUser } from '@/components/shell-user-provider';
import { applicantDisplayId } from '@/lib/blind';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import { GradingEditControl } from '@/components/grading-edit-control';
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { gradingCompleteGuidance } from '@/lib/next-step-guidance';
import {
  assignmentWorkStatus,
  WORK_STATUS_DISPLAY,
  workStatusBadgeColor,
} from '@/lib/stages';
import { ClipboardListIcon } from 'lucide-react';

interface Assignment {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  status: string;
}

interface GradingNextStep {
  kind: 'color_recommendations';
  href: string;
  isDirector: boolean;
}

interface GradingData {
  grader: { id: number; name: string; email: string };
  assignments: Assignment[];
  progress: { completed: number; total: number };
  gradingEditLock: GradingEditLock;
  nextStep: GradingNextStep | null;
}

export default function TeamApplicationGradingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();
  const { teams } = useShellUser();
  const teamName = teams.find((t) => String(t.id) === teamId)?.name ?? '';
  const [data, setData] = useState<GradingData | null>(null);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    // Always refetch — coming off the last submit should not show a stale "still pending" queue.
    invalidateClientFetchCache(`/api/team/grading?teamId=${teamId}`);
    cachedJsonFetch<GradingData & { error?: string }>(`/api/team/grading?teamId=${teamId}`, {
      force: true,
    }).then(({ status, json }) => {
      if (status === 401) {
        router.push('/login');
        return;
      }
      if (!json) return;
      if (json.error) {
        setAccessError(json.error);
        return;
      }
      setData(json);
    });
  }, [router, teamId]);

  if (accessError && !data) {
    return (
      <CenteredMessage
        title="Can't open grading"
        description={accessError}
        ctaLabel="← Team overview"
        onCtaClick={() => router.push(`/team/${teamId}`)}
      />
    );
  }

  if (!data) return <PageLoading />;

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
        onCtaClick={() => router.push(`/team/${teamId}`)}
      />
    );
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={teamName || 'Your team'}
        title="Application grading"
        description={
          completeCopy
            ? undefined
            : allDone
              ? undefined
              : 'Score each assigned application. When you finish, you\'ll add color recommendations next.'
        }
        actions={
          <LoadingButton variant="secondary" onClick={() => router.push(`/team/${teamId}`)}>
            ← Overview
          </LoadingButton>
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
            <LoadingButton className="w-full sm:w-auto" onClick={() => router.push(nextStep.href)}>
              {completeCopy.ctaLabel}
            </LoadingButton>
          </Card>
        )}

        <Card className="gap-4 p-5 sm:p-6">
          <ProgressBar
            value={data.progress.completed}
            max={data.progress.total}
            label="Applications graded"
          />
          {!allDone && !gradingLocked && firstPending && (
            <LoadingButton
              className="w-full"
              onClick={() =>
                router.push(`/team/${teamId}/grade/${firstPending.applicationId}`)
              }
            >
              {data.progress.completed === 0 ? 'Start grading' : 'Continue grading'} →
            </LoadingButton>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Your applications</CardTitle>
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
