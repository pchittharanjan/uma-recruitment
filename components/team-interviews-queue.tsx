'use client';

import { useMemo } from 'react';
import { MicIcon } from 'lucide-react';
import { InterviewEditControl } from '@/components/interview-edit-control';
import { NavLinkButton } from '@/components/nav-link-button';
import ProgressBar from '@/components/progress-bar';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import { sessionKeyForAssignment } from '@/lib/interview-sessions';
import {
  interviewAppHref,
  interviewBackHref,
  type InterviewAudience,
} from '@/lib/interview-paths';
import {
  assignmentWorkStatus,
  resolveWorkStatus,
  WORK_STATUS_DISPLAY,
  workStatusBadgeColor,
} from '@/lib/stages';
import { useShellUser } from '@/components/shell-user-provider';
import { interviewCompleteGuidance } from '@/lib/next-step-guidance';
import {
  interviewNotesLocked,
  scoresLockedNotesEditable,
} from '@/lib/advancement-submissions-types';
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

/** Prefer an unfinished candidate; otherwise reopen the first person in the session. */
function sessionOpenApplicationId(assignments: TeamInterviewAssignment[]): number | null {
  return firstPendingApplicationId(assignments) ?? assignments[0]?.applicationId ?? null;
}

export function TeamInterviewsQueue({
  teamId,
  stage,
  data,
  error,
  audience = 'team',
}: {
  teamId: string;
  stage: string;
  data: TeamInterviewData | null;
  error?: string;
  audience?: InterviewAudience;
}) {
  const { teams } = useShellUser();
  const hasMultipleTeams = audience === 'team' && teams.length > 1;
  const backHref = audience === 'admin' ? interviewBackHref(teamId, audience) : hasMultipleTeams ? '/team' : interviewBackHref(teamId, audience);
  const backLabel = audience === 'admin' ? '← Team' : hasMultipleTeams ? '← Teams' : '← Overview';

  const sessions = useMemo(
    () => (data ? groupIntoSessions(data.assignments) : []),
    [data],
  );

  if (error) {
    return (
      <CenteredMessage
        title="Can't open interviews"
        description={error}
        ctaLabel={backLabel}
        ctaHref={backHref}
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
  const scoringLocked = data.scoringEditLock?.locked ?? false;
  const notesLocked = interviewNotesLocked(data.scoringEditLock);
  const notesEditableWhileScoresLocked = scoresLockedNotesEditable(data.scoringEditLock);
  const lockMessage = data.scoringEditLock?.message ?? '';
  const editLabel = notesEditableWhileScoresLocked ? 'Edit notes' : 'Edit scores & notes';
  const nextStep = audience === 'team' ? data.nextStep : null;
  const completeCopy = nextStep ? interviewCompleteGuidance(nextStep.isDirector) : null;
  const finalRoundComplete = stage === 'final_round' && allDone;

  if (data.progress.total === 0) {
    return (
      <CenteredMessage
        icon={MicIcon}
        title="No interviews assigned"
        description="An admin will add you on the schedule grid. Check back once your slots are set."
        ctaLabel={backLabel}
        ctaHref={backHref}
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
            <NavLinkButton variant="secondary" href={backHref}>
              {backLabel}
            </NavLinkButton>
          }
        />

        {scoringLocked && lockMessage ? (
          <StatusBanner type="info" message={lockMessage} />
        ) : null}

        {finalRoundComplete && (
          <Card className="gap-4 border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
            <div className="space-y-1">
              <CardTitle className="text-base">All final interviews scored</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Wait for Admin to advance the team before deliberations open.
              </CardDescription>
            </div>
          </Card>
        )}

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

          <div
            data-tour="interview-queue-progress"
            className="rounded-xl border border-border/50 bg-surface-panel px-5 py-4 sm:px-6 sm:py-5"
          >
            <ProgressBar
              value={data.progress.completed}
              max={data.progress.total}
            />

            {!allDone && !scoringLocked && firstPending && !firstPendingIsGroup && (
              <div className="mt-3 flex justify-end">
                <NavLinkButton
                  size="sm"
                  href={interviewAppHref(teamId, stage, firstPending.applicationId, audience)}
                  data-tour="interview-queue-next"
                >
                  Next Interview →
                </NavLinkButton>
              </div>
            )}
          </div>
        </div>

        <div data-tour="interview-queue" className="space-y-3">
          <p className="uma-section-label">Your Interviews</p>

          <Card className="overflow-hidden">
            <CardContent className="space-y-2 px-4 pb-1 pt-1">
              {sessions.map((session) => {
                const timeLabel = formatSlotTime(session.scheduledAt);
                const isGroup = session.assignments.length > 1;
                const openApplicationId = sessionOpenApplicationId(session.assignments);
                const pendingCount = session.assignments.filter((a) => a.status === 'pending').length;
                const sessionFullyDone = pendingCount === 0;
                const sessionStatus = resolveWorkStatus(
                  pendingCount,
                  session.assignments.length,
                  session.assignments.some((a) => a.status === 'completed'),
                );

                return (
                  <div key={session.key} className="overflow-hidden py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        {isGroup ? (
                          <p className="text-sm font-medium text-foreground">
                            Group interview · {session.assignments.length} candidates
                          </p>
                        ) : null}
                        {(timeLabel || session.location) && (
                          <p className="text-sm text-muted-foreground">
                            {timeLabel}
                            {session.location ? ` · ${session.location}` : ''}
                          </p>
                        )}
                      </div>
                      {sessionStatus ? (
                        <StageBadge
                          label={WORK_STATUS_DISPLAY[sessionStatus]}
                          color={workStatusBadgeColor(sessionStatus)}
                          size="compact"
                        />
                      ) : null}
                    </div>

                    <ul className="mt-3 divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50 bg-background/60">
                      {session.assignments.map((a) => {
                        const workStatus = assignmentWorkStatus(a.status);

                        if (isGroup) {
                          return (
                            <li
                              key={a.assignmentId}
                              className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
                            >
                              <span className="min-w-0 truncate text-sm text-foreground">{a.candidateName}</span>
                              <StageBadge
                                label={WORK_STATUS_DISPLAY[workStatus]}
                                color={workStatusBadgeColor(workStatus)}
                                size="compact"
                              />
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
                              <StageBadge
                                label={WORK_STATUS_DISPLAY[workStatus]}
                                color={workStatusBadgeColor(workStatus)}
                                size="compact"
                              />
                              {a.status === 'pending' && !scoringLocked ? (
                                <NavLinkButton
                                  variant="ghost"
                                  className="text-sm"
                                  href={interviewAppHref(teamId, stage, a.applicationId, audience)}
                                >
                                  Score →
                                </NavLinkButton>
                              ) : notesLocked ? (
                                <InterviewEditControl
                                  teamId={teamId}
                                  stage={stage}
                                  applicationId={a.applicationId}
                                  locked
                                  lockMessage={lockMessage}
                                  audience={audience}
                                  label={editLabel}
                                />
                              ) : (
                                <NavLinkButton
                                  variant="ghost"
                                  className="text-sm"
                                  href={interviewAppHref(teamId, stage, a.applicationId, audience)}
                                  data-tour="interview-queue-edit"
                                >
                                  {editLabel}
                                </NavLinkButton>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {isGroup && openApplicationId !== null && (
                      <div className="mt-3 space-y-1">
                        {!sessionFullyDone && !scoringLocked ? (
                          <p className="text-xs text-muted-foreground">
                            Scores auto-save — submit the whole session when every candidate is scored.
                          </p>
                        ) : null}
                        <div className="flex items-center justify-end gap-3">
                          {!sessionFullyDone && !scoringLocked ? (
                            <NavLinkButton
                              size="sm"
                              href={interviewAppHref(teamId, stage, openApplicationId, audience)}
                              data-tour="interview-queue-next"
                            >
                              Score group session →
                            </NavLinkButton>
                          ) : notesLocked ? (
                            <InterviewEditControl
                              teamId={teamId}
                              stage={stage}
                              applicationId={openApplicationId}
                              locked
                              lockMessage={lockMessage}
                              audience={audience}
                              label={editLabel}
                            />
                          ) : (
                            <NavLinkButton
                              variant="ghost"
                              size="sm"
                              className="text-sm"
                              href={interviewAppHref(teamId, stage, openApplicationId, audience)}
                              data-tour="interview-queue-edit"
                            >
                              {editLabel}
                            </NavLinkButton>
                          )}
                        </div>
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
