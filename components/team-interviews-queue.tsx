'use client';

import { useMemo } from 'react';
import { MicIcon } from 'lucide-react';
import { NavLinkButton } from '@/components/nav-link-button';
import ProgressBar from '@/components/progress-bar';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sessionKeyForAssignment } from '@/lib/interview-sessions';
import {
  assignmentWorkStatus,
  resolveWorkStatus,
} from '@/lib/stages';
import { useShellUser } from '@/components/shell-user-provider';
import { interviewCompleteGuidance } from '@/lib/next-step-guidance';
import type { TeamInterviewAssignment, TeamInterviewData } from '@/lib/team-interviews-types';

interface InterviewSession {
  key: string;
  scheduledAt: string | null;
  location: string | null;
  assignments: TeamInterviewAssignment[];
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

function groupIntoSessions(assignments: TeamInterviewAssignment[]): InterviewSession[] {
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

function firstPendingApplicationId(assignments: TeamInterviewAssignment[]): number | null {
  return assignments.find((a) => a.status === 'pending')?.applicationId ?? null;
}

export function TeamInterviewsQueue({
  teamId,
  stage,
  data,
  error,
}: {
  teamId: string;
  stage: string;
  data: TeamInterviewData | null;
  error?: string;
}) {
  const { teams } = useShellUser();
  const hasMultipleTeams = teams.length > 1;

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
        ctaHref={hasMultipleTeams ? '/team' : `/team/${teamId}`}
      />
    );
  }

  if (!data) return null;

  const firstPending = data.assignments.find((a) => a.status === 'pending');
  const firstPendingSession = sessions.find((session) =>
    session.assignments.some((a) => a.status === 'pending'),
  );
  const firstPendingIsGroup = (firstPendingSession?.assignments.length ?? 0) > 1;
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
        ctaHref={hasMultipleTeams ? '/team' : `/team/${teamId}`}
      />
    );
  }

  return (
    <PageContainer>
      <PageSection>
        <PageHeader
          eyebrow="Interview queue"
          title={data.stageLabel}
          actions={
            hasMultipleTeams ? (
              <NavLinkButton variant="secondary" href="/team">
                ← Teams
              </NavLinkButton>
            ) : undefined
          }
        />

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

        <div className="space-y-3">
          <p className="uma-section-label">Interviews Completed</p>

          <div className="rounded-xl border border-border/50 bg-surface-panel px-5 py-4 sm:px-6 sm:py-5">
            <ProgressBar
              value={data.progress.completed}
              max={data.progress.total}
            />

            {!allDone && firstPending && !firstPendingIsGroup && (
              <div className="mt-3 flex justify-end">
                <NavLinkButton
                  size="sm"
                  href={`/team/${teamId}/interviews/${stage}/${firstPending.applicationId}`}
                >
                  Next Interview →
                </NavLinkButton>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="uma-section-label">Your Interviews</p>

          <Card className="overflow-hidden">
            <CardContent className="space-y-2 px-4 pb-1 pt-1">
              {sessions.map((session) => {
                const timeLabel = formatSlotTime(session.scheduledAt);
                const isGroup = session.assignments.length > 1;
                const scoreTargetId = firstPendingApplicationId(session.assignments);

                return (
                  <div key={session.key} className="overflow-hidden">
                    {(timeLabel || session.location) && (
                      <p className="mt-0 text-sm text-muted-foreground">
                        Next:{' '}
                        <span className="font-medium text-foreground">
                          {timeLabel}
                          {session.location ? ` · ${session.location}` : ''}
                        </span>
                      </p>
                    )}

                    <ul className="mt-3 divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-background/60">
                      {session.assignments.map((a) => {
                        if (isGroup) {
                          return (
                            <li
                              key={a.assignmentId}
                              className="flex items-center px-3 py-3 text-sm"
                            >
                              <span className="min-w-0 truncate text-sm text-foreground">{a.candidateName}</span>
                            </li>
                          );
                        }

                        return (
                          <li
                            key={a.assignmentId}
                            className="uma-hover-on-nested flex items-center justify-between gap-3 px-3 py-3 text-sm"
                          >
                            <span className="min-w-0 truncate text-sm text-foreground">{a.candidateName}</span>
                            <div className="flex items-center gap-2 justify-end">
                              {a.status === 'pending' && (
                                <NavLinkButton
                                  variant="ghost"
                                  className="text-sm"
                                  href={`/team/${teamId}/interviews/${stage}/${a.applicationId}`}
                                >
                                  Score →
                                </NavLinkButton>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {isGroup && scoreTargetId !== null && (
                      <div className="mt-6 flex items-center justify-end gap-3">
                        <NavLinkButton
                          size="sm"
                          href={`/team/${teamId}/interviews/${stage}/${scoreTargetId}`}
                        >
                          Next Interview →
                        </NavLinkButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </PageSection>
    </PageContainer>
  );
}
