'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingButton from '@/components/loading-button';
import ProgressBar from '@/components/progress-bar';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AssignmentStage } from '@/lib/db';
import { sessionKeyForAssignment } from '@/lib/interview-sessions';
import {
  assignmentStageLabel,
  assignmentWorkStatus,
  resolveWorkStatus,
  WORK_STATUS_DISPLAY,
  workStatusBadgeColor,
} from '@/lib/stages';
import { MicIcon } from 'lucide-react';
import { useShellUser } from '@/components/shell-user-provider';
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { interviewCompleteGuidance } from '@/lib/next-step-guidance';

interface Assignment {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  candidateName: string;
  status: string;
  scheduledAt: string | null;
  location: string | null;
  logisticsNote: string | null;
  groupKey: string | null;
}

interface InterviewNextStep {
  kind: 'color_recommendations';
  href: string;
  isDirector: boolean;
}

interface InterviewData {
  grader: { id: number; name: string; email: string };
  stage: AssignmentStage;
  stageLabel: string;
  assignments: Assignment[];
  progress: { completed: number; total: number };
  nextStep: InterviewNextStep | null;
}

interface InterviewSession {
  key: string;
  scheduledAt: string | null;
  location: string | null;
  assignments: Assignment[];
}

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

function groupIntoSessions(assignments: Assignment[]): InterviewSession[] {
  const map = new Map<string, InterviewSession>();

  for (const assignment of assignments) {
    const key = sessionKeyForAssignment({
      applicationId: assignment.applicationId,
      groupKey: assignment.groupKey,
      scheduledAt: assignment.scheduledAt,
      location: assignment.location,
    });
    const existing = map.get(key);
    if (existing) {
      existing.assignments.push(assignment);
      continue;
    }
    map.set(key, {
      key,
      scheduledAt: assignment.scheduledAt,
      location: assignment.location,
      assignments: [assignment],
    });
  }

  return Array.from(map.values());
}


function firstPendingApplicationId(assignments: Assignment[]): number | null {
  return assignments.find((a) => a.status === 'pending')?.applicationId ?? null;
}

export default function TeamInterviewsPage({
  params,
}: {
  params: Promise<{ teamId: string; stage: string }>;
}) {
  const { teamId, stage } = use(params);
  const router = useRouter();
  const { teams } = useShellUser();
  const hasMultipleTeams = teams.length > 1;
  const [data, setData] = useState<InterviewData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invalidateClientFetchCache(`/api/team/interviews?teamId=${teamId}&stage=${stage}`);
    cachedJsonFetch<InterviewData & { error?: string }>(
      `/api/team/interviews?teamId=${teamId}&stage=${stage}`,
      { force: true },
    )
      .then(({ json }) => {
        if (!json) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setData(json);
      })
      .catch(() => setError('Failed to load interviews.'));
  }, [teamId, stage]);

  const sessions = useMemo(
    () => (data ? groupIntoSessions(data.assignments) : []),
    [data],
  );

  if (error) {
    return (
      <CenteredMessage
        title="Can't open interviews"
        description={error}
        ctaLabel={hasMultipleTeams ? '← Teams' : '← Overview'}
        onCtaClick={() =>
          router.push(hasMultipleTeams ? '/team' : `/team/${teamId}`)
        }
      />
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  const firstPending = data.assignments.find((a) => a.status === 'pending');
  const allDone = data.progress.completed === data.progress.total && data.progress.total > 0;
  const nextStep = data.nextStep;
  const completeCopy = nextStep ? interviewCompleteGuidance(nextStep.isDirector) : null;

  if (data.progress.total === 0) {
    return (
      <CenteredMessage
        icon={MicIcon}
        title="No interviews assigned"
        description="An admin will add you on the schedule grid. Check back once your slots are set."
        ctaLabel={hasMultipleTeams ? '← Teams' : '← Overview'}
        onCtaClick={() =>
          router.push(hasMultipleTeams ? '/team' : `/team/${teamId}`)
        }
      />
    );
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Interview queue"
        title={data.stageLabel}
        description={
          completeCopy
            ? undefined
            : allDone
              ? undefined
              : stage === 'first_round'
                ? 'Score each interview. When you finish, you\'ll add color recommendations next.'
                : 'Score each interview on the rubric.'
        }
        actions={
          hasMultipleTeams ? (
            <LoadingButton variant="secondary" onClick={() => router.push('/team')}>
              ← Teams
            </LoadingButton>
          ) : undefined
        }
      />

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

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
              {data.grader.name[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{data.grader.name}</h2>
              <p className="text-sm text-muted-foreground">{data.grader.email}</p>
            </div>
          </div>
          <ProgressBar
            value={data.progress.completed}
            max={data.progress.total}
            label="Interviews completed"
          />
          {!allDone && firstPending && (
            <LoadingButton
              className="mt-4 w-full"
              onClick={() =>
                router.push(`/team/${teamId}/interviews/${stage}/${firstPending.applicationId}`)
              }
            >
              {data.progress.completed === 0 ? 'Start interviewing' : 'Continue interviewing'} →
            </LoadingButton>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Your interviews</CardTitle>
            <CardDescription>
              {assignmentStageLabel(data.stage)} · grouped by interview slot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {sessions.map((session) => {
              const timeLabel = formatSlotTime(session.scheduledAt);
              const isGroup = session.assignments.length > 1;
              const sessionStatus = resolveWorkStatus(
                session.assignments.filter((a) => a.status === 'pending').length,
                session.assignments.length,
              );
              const scoreTargetId = firstPendingApplicationId(session.assignments);

              return (
                <div
                  key={session.key}
                  className="overflow-hidden rounded-lg bg-muted/40"
                >
                  {(timeLabel || session.location) && (
                    <div className="bg-muted px-4 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {isGroup ? 'Group interview' : 'Interview slot'}
                      </p>
                      <p className="text-sm font-medium">
                        {timeLabel}
                        {session.location ? ` · ${session.location}` : ''}
                      </p>
                    </div>
                  )}

                  {isGroup ? (
                    <>
                      <ul className="divide-y divide-border/60">
                        {session.assignments.map((a) => (
                          <li key={a.assignmentId} className="px-4 py-2.5">
                            <span className="text-sm font-medium">{a.candidateName}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-between px-4 py-3">
                        {sessionStatus && (
                          <StageBadge
                            label={WORK_STATUS_DISPLAY[sessionStatus]}
                            color={workStatusBadgeColor(sessionStatus)}
                          />
                        )}
                        {scoreTargetId !== null && (
                          <LoadingButton
                            variant="ghost"
                            className="text-sm"
                            onClick={() =>
                              router.push(
                                `/team/${teamId}/interviews/${stage}/${scoreTargetId}`,
                              )
                            }
                          >
                            Score group →
                          </LoadingButton>
                        )}
                      </div>
                    </>
                  ) : (
                    session.assignments.map((a) => {
                      const workStatus = assignmentWorkStatus(a.status);
                      return (
                      <div
                        key={a.assignmentId}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <span className="text-sm font-medium">{a.candidateName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StageBadge
                            label={WORK_STATUS_DISPLAY[workStatus]}
                            color={workStatusBadgeColor(workStatus)}
                          />
                          {a.status === 'pending' && (
                            <LoadingButton
                              variant="ghost"
                              className="text-sm"
                              onClick={() =>
                                router.push(
                                  `/team/${teamId}/interviews/${stage}/${a.applicationId}`,
                                )
                              }
                            >
                              Score →
                            </LoadingButton>
                          )}
                        </div>
                      </div>
                    );
                    })
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
