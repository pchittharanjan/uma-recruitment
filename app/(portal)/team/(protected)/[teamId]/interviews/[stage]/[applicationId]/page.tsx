'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import PageLoading from '@/components/page-loading';
import { CasePdfPane } from '@/components/case-pdf-pane';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageContent } from '@/components/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import { Button } from '@/components/ui/button';
import StatusBanner from '@/components/status-banner';
import { InterviewNotesAndScoringForm } from '@/components/interview-question-eval';
import { type InterviewGuide } from '@/lib/interview-guide';
import type { AssignmentStage } from '@/lib/db';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import { formatInterviewProgressLabel } from '@/lib/interview-sessions';
import { cn } from '@/lib/utils';

interface GroupMember {
  applicationId: number;
  candidateName: string;
}

interface GroupEntry {
  applicationId: number;
  candidateName: string;
  existingScores: Record<string, number>;
  existingNotes: Record<string, string>;
  existingComment: string;
  isComplete: boolean;
}

interface CandidateDraft {
  scores: Record<string, number>;
  notes: Record<string, string>;
  comment: string;
}

interface InterviewScoreData {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  candidateName: string;
  stage: AssignmentStage;
  existingScores: Record<string, number>;
  existingNotes: Record<string, string>;
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
  if (!iso) return '-';
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
  if (!iso) return '-';
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

function emptyDraft(): CandidateDraft {
  return { scores: {}, notes: {}, comment: '' };
}

function NotesPanelHeader({
  title,
  intro,
}: {
  title: string;
  intro?: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {intro?.trim() ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{intro.trim()}</p>
      ) : null}
    </div>
  );
}

function NotesAndEvaluationForm({
  guide,
  draft,
  locked,
  onNoteChange,
  onScoreChange,
  onCommentChange,
}: {
  guide: InterviewGuide | null;
  draft: CandidateDraft;
  locked: boolean;
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
  onCommentChange: (value: string) => void;
}) {
  return (
    <InterviewNotesAndScoringForm
      guide={guide}
      notes={draft.notes}
      scores={draft.scores}
      comment={draft.comment}
      disabled={locked}
      onNoteChange={onNoteChange}
      onScoreChange={onScoreChange}
      onCommentChange={onCommentChange}
    />
  );
}

export default function TeamInterviewScorePage({
  params,
}: {
  params: Promise<{ teamId: string; stage: string; applicationId: string }>;
}) {
  const { teamId, stage, applicationId } = use(params);
  const [data, setData] = useState<InterviewScoreData | null>(null);
  const [draft, setDraft] = useState<CandidateDraft>(emptyDraft());
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
        setDraft({
          scores: d.existingScores ?? {},
          notes: d.existingNotes ?? {},
          comment: d.existingComment ?? '',
        });

        if (d.groupEntries?.length > 1) {
          const initial: Record<number, CandidateDraft> = {};
          for (const entry of d.groupEntries as GroupEntry[]) {
            initial[entry.applicationId] = {
              scores: entry.existingScores ?? {},
              notes: entry.existingNotes ?? {},
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
  const casePdfUrl = data?.interviewGuide?.casePdfUrl;

  const groupCompletion = useMemo(() => {
    if (!data?.groupEntries) return { completed: 0, total: 0 };
    const total = data.groupEntries.length;
    const completed = data.groupEntries.filter((entry) =>
      isDraftComplete(drafts[entry.applicationId] ?? emptyDraft(), scoreFieldList),
    ).length;
    return { completed, total };
  }, [data?.groupEntries, drafts, scoreFieldList]);

  const handleSingleSubmit = async () => {
    if (!data) return;
    const missing = scoreFieldList.filter((f) => draft.scores[f] === undefined);
    if (missing.length > 0) {
      const message = 'Please score all questions before submitting.';
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
          body: JSON.stringify({
            scores: draft.scores,
            notes: draft.notes,
            comment: draft.comment,
          }),
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
              ? 'All interviews scored. Next: color recommendations, then meet with your PMs'
              : 'All interviews scored. Next: color recommendations'
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
      (entry) => !isDraftComplete(drafts[entry.applicationId] ?? emptyDraft(), scoreFieldList),
    );
    if (incomplete.length > 0) {
      const message = `Please score all questions for every applicant (${incomplete.length} remaining).`;
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
        notes: drafts[entry.applicationId].notes,
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
  const pdfTitle =
    data.interviewGuide?.caseStudy?.title?.trim() ||
    (stage === 'first_round' ? 'Group case' : 'Case');

  const header = (
    <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <PageContainer className="py-3">
        <PageContent width="fluid" className="flex items-center">
          <div className="flex-1">
            <button
              onClick={() => router.push(`/team/${teamId}/interviews/${stage}`)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
          </div>
          <div className="text-center">
            <span className="text-sm font-medium">
              {isGroupInterview
                ? [
                    'Group interview',
                    data.slot ? formatSlotHeader(data.slot.scheduledAt) : null,
                    data.slot?.location,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : data.candidateName}
            </span>
            {!isGroupInterview && data.interviewProgress && (
              <p className="text-sm text-muted-foreground">
                {formatInterviewProgressLabel(data.interviewProgress)}
              </p>
            )}
          </div>
          <div className="flex flex-1 justify-end">
            {data.nextApplicationId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(`/team/${teamId}/interviews/${stage}/${data.nextApplicationId}`)
                }
              >
                Next →
              </Button>
            ) : null}
          </div>
        </PageContent>
      </PageContainer>
    </div>
  );

  const notesContent = isGroupInterview && data.groupEntries ? (
    <>
      {scoringLocked && lockMessage && <StatusBanner type="info" message={lockMessage} />}
      {data.slot?.logisticsNote && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Logistics: </span>
          {data.slot.logisticsNote}
        </p>
      )}
      <NotesPanelHeader
        title="Notes & Evaluation"
        intro={data.interviewGuide?.intro}
      />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-fit max-w-full flex-wrap justify-start">
          {data.groupEntries.map((entry) => {
            const complete = isDraftComplete(
              drafts[entry.applicationId] ?? emptyDraft(),
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
          const entryDraft = drafts[entry.applicationId] ?? emptyDraft();
          return (
            <TabsContent
              key={entry.applicationId}
              value={String(entry.applicationId)}
              className="space-y-4"
            >
              <h3 className="text-lg font-semibold">{entry.candidateName}</h3>
              <NotesAndEvaluationForm
                guide={data.interviewGuide ?? null}
                draft={entryDraft}
                locked={scoringLocked}
                onNoteChange={(field, value) =>
                  updateDraft(entry.applicationId, {
                    notes: { ...entryDraft.notes, [field]: value },
                  })
                }
                onScoreChange={(field, value) =>
                  updateDraft(entry.applicationId, {
                    scores: { ...entryDraft.scores, [field]: value },
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
    </>
  ) : (
    <>
      {scoringLocked && lockMessage && <StatusBanner type="info" message={lockMessage} />}
      {data.slot && (
        <p className="text-sm text-muted-foreground">
          {formatSlotTime(data.slot.scheduledAt)}
          {data.slot.location ? ` · ${data.slot.location}` : ''}
          {data.slot.logisticsNote ? ` · ${data.slot.logisticsNote}` : ''}
        </p>
      )}
      <NotesPanelHeader
        title="Notes & Evaluation"
        intro={data.interviewGuide?.intro}
      />
      <NotesAndEvaluationForm
        guide={data.interviewGuide ?? null}
        draft={draft}
        locked={scoringLocked}
        onNoteChange={(field, value) =>
          setDraft((prev) => ({ ...prev, notes: { ...prev.notes, [field]: value } }))
        }
        onScoreChange={(field, value) =>
          setDraft((prev) => ({ ...prev, scores: { ...prev.scores, [field]: value } }))
        }
        onCommentChange={(value) => setDraft((prev) => ({ ...prev, comment: value }))}
      />
      {submitError && <StatusBanner message={submitError} type="error" />}
    </>
  );

  const groupFooter = (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        casePdfUrl
          ? 'shrink-0 border-t border-border bg-muted/50 px-6 py-4 sm:px-7 lg:px-8'
          : 'pt-2',
      )}
    >
      <div className="flex-1">
        <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-background">
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
        disabled={scoringLocked}
      >
        {scoringLocked ? 'Editing locked' : 'Submit all →'}
      </LoadingButton>
    </div>
  );

  const singleFooter = (
    <GradingSubmitFooter
      variant={casePdfUrl ? 'embedded' : 'sticky'}
      scoredCount={scoreFieldList.filter((f) => draft.scores[f] !== undefined).length}
      totalScored={scoreFieldList.length}
      onSubmit={handleSingleSubmit}
      submitting={submitting}
      locked={scoringLocked}
    />
  );

  const footer = isGroupInterview ? groupFooter : singleFooter;

  if (casePdfUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="grid min-h-[calc(100svh-8rem)] flex-1 grid-cols-1 overflow-hidden rounded-xl bg-surface-panel lg:grid-cols-2">
          <CasePdfPane url={casePdfUrl} title={pdfTitle} />
          <div className="flex min-h-0 flex-col">
            <div className={cn('min-h-0 flex-1 overflow-y-auto p-6 sm:p-7 lg:p-8', 'space-y-8')}>
              {notesContent}
            </div>
            {footer}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      <PageContainer>
        <PageContent width="wide" className="space-y-8">
          {notesContent}
          {footer}
        </PageContent>
      </PageContainer>
    </>
  );
}
