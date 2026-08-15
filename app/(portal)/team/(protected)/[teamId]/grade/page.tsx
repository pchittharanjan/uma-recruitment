'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingButton from '@/components/loading-button';
import ProgressBar from '@/components/progress-bar';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { applicantDisplayId } from '@/lib/blind';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import { GradingEditControl } from '@/components/grading-edit-control';
import {
  assignmentWorkStatus,
  WORK_STATUS_DISPLAY,
  workStatusBadgeColor,
} from '@/lib/stages';

interface Assignment {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  status: string;
}

interface GradingData {
  grader: { id: number; name: string; email: string };
  assignments: Assignment[];
  progress: { completed: number; total: number };
  gradingEditLock: GradingEditLock;
}

export default function TeamApplicationGradingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<GradingData | null>(null);
  const [teamName, setTeamName] = useState('');
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((me) => {
        const team = me.teams?.find((t: { id: number }) => String(t.id) === teamId);
        if (team) setTeamName(team.name);
      });

    fetch(`/api/team/grading?teamId=${teamId}`)
      .then((r) => {
        if (r.status === 401) {
          router.push('/login');
          return null;
        }
        return r.json();
      })
      .then((json) => {
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
      <PageContainer className="space-y-4">
        <StatusBanner message={accessError} type="error" />
        <LoadingButton variant="secondary" onClick={() => router.push(`/team/${teamId}`)}>
          ← Team overview
        </LoadingButton>
      </PageContainer>
    );
  }

  if (!data) return <PageLoading />;

  const firstPending = data.assignments.find((a) => a.status === 'pending');
  const allDone = data.progress.completed === data.progress.total;
  const gradingLocked = data.gradingEditLock?.locked ?? false;
  const lockMessage = data.gradingEditLock?.message ?? '';

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={teamName || 'Your team'}
        title="Application grading"
        description="All applications assigned to you for blind review."
        actions={
          <LoadingButton variant="secondary" onClick={() => router.push(`/team/${teamId}`)}>
            ← Overview
          </LoadingButton>
        }
      />

      {gradingLocked && <StatusBanner type="info" message={lockMessage} />}

      <PageSection>
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
            {data.assignments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No applications assigned to you yet.
              </p>
            ) : (
              data.assignments.map((a) => {
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
              })
            )}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
