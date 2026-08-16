'use client';

import React, { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import PageLoading from '@/components/page-loading';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageContent, PageHeader } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import { Button } from '@/components/ui/button';
import ScoreSelector from '@/components/ScoreSelector';
import StatusBanner from '@/components/status-banner';
import { RequiredAsterisk } from '@/components/ui/label';
import { InterviewGuideDisplay } from '@/components/interview-guide-display';
import type { InterviewGuide } from '@/lib/interview-guide';
import type { AssignmentStage } from '@/lib/db';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import { formatInterviewProgressLabel } from '@/lib/interview-sessions';

interface GroupMember {
  applicationId: number;
  candidateName: string;
}

interface GroupEntry {
  applicationId: number;
  candidateName: string;
  existingScores: Record<string, number>;
  existingComment: string;
  isComplete: boolean;
}

interface CandidateDraft {
  scores: Record<string, number>;
  comment: string;
}

interface InterviewScoreData {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  candidateName: string;
  stage: AssignmentStage;
  existingScores: Record<string, number>;
  existingComment: string;
  slot: {
    scheduledAt: string;
    location: string | null;
    logisticsNote: string | null;
  } | null;
  interviewGuide: InterviewGuide | null;
  groupMembers: GroupMember[];
  groupEntries?: GroupEntry[];
  graderProgress: { total: number; completed: number };
  interviewProgress: { current: number; total: number } | null;
  nextApplicationId: number | null;
  scoreFields: string[];
  customScoreFields: string[];
  scoringEditLock?: GradingEditLock;
}

function formatSlotTime(iso: string): string {
  if (!iso) return '—';
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

function formatSlotHeader(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

function allScoreFields(data: InterviewScoreData): string[] {
  return [...data.scoreFields, ...(data.customScoreFields ?? [])];
}

function isDraftComplete(draft: CandidateDraft, fields: string[]): boolean {
  return fields.length > 0 && fields.every((f) => draft.scores[f] !== undefined);
}

function ScoreFieldsForm({
  data,
  draft,
  onScoreChange,
  onCommentChange,
}: {
  data: InterviewScoreData;
  draft: CandidateDraft;
  onScoreChange: (field: string, value: number) => void;
  onCommentChange: (value: string) => void;
}) {
  return (
    <>
      {data.scoreFields.map((field) => (
        <Card key={field} className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
            {field}
            <RequiredAsterisk className="ml-0.5" />
          </p>
          <div className="pt-3">
            <p className="mb-2 text-sm text-muted-foreground">Score (1 = poor, 5 = excellent)</p>
            <ScoreSelector
              value={draft.scores[field] ?? null}
              onChange={(n) => onScoreChange(field, n)}
            />
          </div>
        </Card>
      ))}

      {(data.customScoreFields ?? []).map((field) => (
        <Card key={`custom:${field}`} className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
            {field}
            <RequiredAsterisk className="ml-0.5" />
          </p>
          <div className="pt-3">
            <p className="mb-2 text-sm text-muted-foreground">Score (1 = poor, 5 = excellent)</p>
            <ScoreSelector
              value={draft.scores[field] ?? null}
              onChange={(n) => onScoreChange(field, n)}
            />
          </div>
        </Card>
      ))}

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Interview notes
        </p>
        <textarea
          value={draft.comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Notes from the interview (not visible to other stages until deliberations)"
          rows={3}
          className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </Card>
    </>
  );
}

function InterviewGuideSection({ guide }: { guide: InterviewGuide }) {
  const showFullGuide = guide.format === 'case_study' || Boolean(guide.intro?.trim());

  return (
    <>
      {showFullGuide && <InterviewGuideDisplay guide={guide} />}
      {guide.format === 'questions' && guide.intro?.trim() && (
        <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Interview intro
          </p>
          <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">
            {guide.intro.trim()}
          </p>
        </Card>
      )}
    </>
  );
}

export default function TeamInterviewScorePage({
  params,
}: {
  params: Promise<{ teamId: string; stage: string; applicationId: string }>;
}) {
  const { teamId, stage, applicationId } = use(params);
  const [data, setData] = useState<InterviewScoreData | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [drafts, setDrafts] = useState<Record<number, CandidateDraft>>({});
  const [activeTab, setActiveTab] = useState(applicationId);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/team/interviews/${applicationId}?teamId=${teamId}&stage=${stage}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setData(d);
        setScores(d.existingScores ?? {});
        setComment(d.existingComment ?? '');

        if (d.groupEntries?.length > 1) {
          const initial: Record<number, CandidateDraft> = {};
          for (const entry of d.groupEntries as GroupEntry[]) {
            initial[entry.applicationId] = {
              scores: entry.existingScores ?? {},
              comment: entry.existingComment ?? '',
            };
          }
          setDrafts(initial);
          setActiveTab(String(applicationId));
        }
      })
      .catch(() => setError('Network error'));
  }, [teamId, stage, applicationId]);

  const isGroupInterview = (data?.groupEntries?.length ?? 0) > 1;
  const scoreFieldList = data ? allScoreFields(data) : [];

  const groupCompletion = useMemo(() => {
    if (!data?.groupEntries) return { completed: 0, total: 0 };
    const total = data.groupEntries.length;
    const completed = data.groupEntries.filter((entry) =>
      isDraftComplete(drafts[entry.applicationId] ?? { scores: {}, comment: '' }, scoreFieldList),
    ).length;
    return { completed, total };
  }, [data?.groupEntries, drafts, scoreFieldList]);

  const handleSingleSubmit = async () => {
    if (!data) return;
    const missing = scoreFieldList.filter((f) => scores[f] === undefined);
    if (missing.length > 0) {
      const message = 'Please score all fields before submitting.';
      setSubmitError(message);
      toast.error(message);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(
        `/api/team/interviews/${applicationId}/score?teamId=${teamId}&stage=${stage}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scores, comment }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error);
        toast.error(json.error ?? 'Failed to submit score');
        return;
      }
      toast.success(
        json.nextApplicationId
          ? 'Interview score submitted'
          : stage === 'first_round'
            ? json.isDirector
              ? 'All interviews scored — next: color recommendations, then meet with your PMs'
              : 'All interviews scored — next: color recommendations'
            : 'All interviews scored',
      );
      if (json.nextApplicationId) {
        router.push(`/team/${teamId}/interviews/${stage}/${json.nextApplicationId}`);
      } else {
        router.push(`/team/${teamId}/interviews/${stage}`);
      }
    } catch {
      setSubmitError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGroupSubmit = async () => {
    if (!data?.groupEntries) return;

    const incomplete = data.groupEntries.filter(
      (entry) => !isDraftComplete(drafts[entry.applicationId] ?? { scores: {}, comment: '' }, scoreFieldList),
    );
    if (incomplete.length > 0) {
      const message = `Please score all fields for every applicant (${incomplete.length} remaining).`;
      setSubmitError(message);
      toast.error(message);
      setActiveTab(String(incomplete[0].applicationId));
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const entries = data.groupEntries.map((entry) => ({
        applicationId: entry.applicationId,
        scores: drafts[entry.applicationId].scores,
        comment: drafts[entry.applicationId].comment,
      }));

      const res = await fetch(
        `/api/team/interviews/${applicationId}/score?teamId=${teamId}&stage=${stage}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error);
        toast.error(json.error ?? 'Failed to submit scores');
        return;
      }
      toast.success('Group interview scores submitted');
      router.push(`/team/${teamId}/interviews/${stage}`);
    } catch {
      setSubmitError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateDraft = (appId: number, patch: Partial<CandidateDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [appId]: { ...prev[appId], ...patch },
    }));
  };

  if (error) {
    return (
      <CenteredMessage
        title="Couldn't load interview"
        description={error}
        ctaLabel="Back"
        onCtaClick={() => router.push(`/team/${teamId}/interviews/${stage}`)}
      />
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  const scoringLocked = data.scoringEditLock?.locked ?? false;
  const lockMessage = data.scoringEditLock?.message ?? '';

  if (isGroupInterview && data.groupEntries) {
    const slotLabel = data.slot
      ? [
          'Group interview',
          formatSlotHeader(data.slot.scheduledAt),
          data.slot.location,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Group interview';

    const allCandidatesScored = groupCompletion.completed === groupCompletion.total;

    return (
      <>
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <PageContainer className="py-3">
            <PageContent width="wide">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => router.push(`/team/${teamId}/interviews/${stage}`)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
                <span className="text-sm font-medium">{slotLabel}</span>
                {data.nextApplicationId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      router.push(
                        `/team/${teamId}/interviews/${stage}/${data.nextApplicationId}`,
                      )
                    }
                  >
                    Next →
                  </Button>
                ) : (
                  <button
                    onClick={() => router.push(`/team/${teamId}/interviews/${stage}`)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to interviews
                  </button>
                )}
              </div>
            </PageContent>
          </PageContainer>
        </div>

        <PageContainer>
          <PageContent width="wide" className="space-y-4">
            {scoringLocked && lockMessage && (
              <StatusBanner type="info" message={lockMessage} />
            )}

            {data.slot?.logisticsNote && (
              <Card className="p-4">
                <p className="text-sm">
                  <span className="text-muted-foreground">Logistics: </span>
                  {data.slot.logisticsNote}
                </p>
              </Card>
            )}

            {data.interviewGuide && <InterviewGuideSection guide={data.interviewGuide} />}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-fit max-w-full flex-wrap justify-start">
                {data.groupEntries.map((entry) => {
                  const complete = isDraftComplete(
                    drafts[entry.applicationId] ?? { scores: {}, comment: '' },
                    scoreFieldList,
                  );
                  return (
                    <TabsTrigger key={entry.applicationId} value={String(entry.applicationId)}>
                      {firstName(entry.candidateName)}
                      {complete ? (
                        <Check className="size-3.5 text-primary" aria-label="Scored" />
                      ) : (
                        <span className="text-muted-foreground" aria-hidden>
                          ·
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {data.groupEntries.map((entry) => {
                const draft = drafts[entry.applicationId] ?? { scores: {}, comment: '' };
                return (
                  <TabsContent
                    key={entry.applicationId}
                    value={String(entry.applicationId)}
                    className="space-y-4"
                  >
                    <h2 className="text-lg font-semibold">{entry.candidateName}</h2>
                    <ScoreFieldsForm
                      data={data}
                      draft={draft}
                      onScoreChange={(field, value) =>
                        updateDraft(entry.applicationId, {
                          scores: { ...draft.scores, [field]: value },
                        })
                      }
                      onCommentChange={(value) =>
                        updateDraft(entry.applicationId, { comment: value })
                      }
                    />
                  </TabsContent>
                );
              })}
            </Tabs>

            {submitError && <StatusBanner message={submitError} type="error" />}

            <div className="flex items-center justify-between gap-4 pt-6">
              <div className="flex-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${
                        groupCompletion.total
                          ? (groupCompletion.completed / groupCompletion.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {groupCompletion.completed} of {groupCompletion.total} applicants scored
                </p>
              </div>
              <LoadingButton
                onClick={handleGroupSubmit}
                loading={submitting}
                disabled={scoringLocked || !allCandidatesScored}
              >
                {scoringLocked
                  ? 'Editing locked'
                  : allCandidatesScored
                    ? 'Submit all →'
                    : `${groupCompletion.total - groupCompletion.completed} remaining`}
              </LoadingButton>
            </div>
          </PageContent>
        </PageContainer>
      </>
    );
  }

  const scoredCount = scoreFieldList.filter((f) => scores[f] !== undefined).length;
  const totalScored = scoreFieldList.length;
  const progressLabel = data.interviewProgress
    ? formatInterviewProgressLabel(data.interviewProgress)
    : null;

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <PageContainer className="py-3">
          <PageContent width="wide" className="flex items-center">
            <div className="flex-1">
              <button
                onClick={() => router.push(`/team/${teamId}/interviews/${stage}`)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            </div>
            <div className="text-center">
              <span className="text-sm font-medium">{data.candidateName}</span>
              {progressLabel && (
                <p className="text-sm text-muted-foreground">{progressLabel}</p>
              )}
            </div>
            <div className="flex-1" aria-hidden />
          </PageContent>
        </PageContainer>
      </div>

      <PageContainer>
        <PageContent width="wide" className="space-y-4">
          {scoringLocked && lockMessage && (
            <StatusBanner type="info" message={lockMessage} />
          )}

          {data.slot && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your interview slot
              </p>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Time: </span>
                  {formatSlotTime(data.slot.scheduledAt)}
                </p>
                {data.slot.location && (
                  <p>
                    <span className="text-muted-foreground">Location: </span>
                    {data.slot.location}
                  </p>
                )}
                {data.slot.logisticsNote && (
                  <p>
                    <span className="text-muted-foreground">Logistics: </span>
                    {data.slot.logisticsNote}
                  </p>
                )}
              </div>
            </Card>
          )}

          {data.interviewGuide && <InterviewGuideSection guide={data.interviewGuide} />}

          <ScoreFieldsForm
            data={data}
            draft={{ scores, comment }}
            onScoreChange={(field, value) => setScores((prev) => ({ ...prev, [field]: value }))}
            onCommentChange={setComment}
          />

          {submitError && <StatusBanner message={submitError} type="error" />}

          <GradingSubmitFooter
            scoredCount={scoredCount}
            totalScored={totalScored}
            onSubmit={handleSingleSubmit}
            submitting={submitting}
            locked={scoringLocked}
          />
        </PageContent>
      </PageContainer>
    </>
  );
}
