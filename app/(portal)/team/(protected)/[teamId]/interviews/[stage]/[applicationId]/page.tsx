'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import {
  InterviewCaseEvalSplit,
  useInterviewCaseOpen,
} from '@/components/interview-case-eval-split';
import {
  InterviewFullscreenEvalBar,
  InterviewStickyLead,
  InterviewWorkspaceExitFullscreenButton,
  InterviewWorkspaceFullscreenButton,
  useInterviewWorkspaceFullscreen,
} from '@/components/interview-workspace-fullscreen';
import { PageTourHelpButton } from '@/components/page-tour';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageContent } from '@/components/page-shell';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import { Button } from '@/components/ui/button';
import StatusBanner from '@/components/status-banner';
import { InterviewNotesAndScoringForm } from '@/components/interview-question-eval';
import {
  InterviewPhaseToggle,
  type InterviewScoringPhase,
} from '@/components/interview-phase-toggle';
import { DocumentSaveStatusLine } from '@/components/document-save-status';
import { InterviewElapsedTimer } from '@/components/interview-elapsed-timer';
import {
  GroupInterviewCandidateWorkspace,
  GroupInterviewLayoutToggle,
  InterviewNotesPanelHeader,
  useGroupInterviewLayout,
  type GroupInterviewCandidate,
} from '@/components/group-interview-candidate-workspace';
import { useAutosaveStatus } from '@/hooks/use-autosave-status';
import { useElapsedTimer } from '@/hooks/use-elapsed-timer';
import { type InterviewGuide } from '@/lib/interview-guide';
import {
  interviewPhaseScoreFields,
  isPhasedCaseAndBehavioralInterview,
} from '@/lib/interview-guide';
import type { AssignmentStage } from '@/lib/db';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import { formatInterviewProgressLabel } from '@/lib/interview-sessions';
import { interviewCompleteGuidance, interviewCompleteToast } from '@/lib/next-step-guidance';
import {
  interviewAppHref,
  interviewAudienceFromPathname,
  interviewQueueHref,
} from '@/lib/interview-paths';
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
  assignmentStatus?: string;
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

function allScoreFields(data: InterviewScoreData): string[] {
  return [...data.scoreFields, ...(data.customScoreFields ?? [])];
}

function isDraftComplete(draft: CandidateDraft, fields: string[]): boolean {
  return fields.length > 0 && fields.every((f) => draft.scores[f] !== undefined);
}

function emptyDraft(): CandidateDraft {
  return { scores: {}, notes: {}, comment: '' };
}

function serializeDraft(draft: CandidateDraft): string {
  return JSON.stringify({
    scores: draft.scores,
    notes: draft.notes,
    comment: draft.comment,
  });
}

function serializeGroupDrafts(
  entries: GroupEntry[],
  drafts: Record<number, CandidateDraft>,
): string {
  return JSON.stringify({
    entries: entries.map((entry) => ({
      applicationId: entry.applicationId,
      scores: drafts[entry.applicationId]?.scores ?? {},
      notes: drafts[entry.applicationId]?.notes ?? {},
      comment: drafts[entry.applicationId]?.comment ?? '',
    })),
  });
}

function NotesAndEvaluationForm({
  guide,
  draft,
  locked,
  compact,
  phase,
  onNoteChange,
  onScoreChange,
  onCommentChange,
}: {
  guide: InterviewGuide | null;
  draft: CandidateDraft;
  locked: boolean;
  compact?: boolean;
  phase?: 'case' | 'behavioral';
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
      compact={compact}
      phase={phase}
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
  const [interviewPhase, setInterviewPhase] = useState<InterviewScoringPhase>('case');
  const [caseOpen, setCaseOpen] = useInterviewCaseOpen();
  const { fullscreen, exit: exitFullscreen, toggle: toggleFullscreen } =
    useInterviewWorkspaceFullscreen();
  const { layout, updateLayout } = useGroupInterviewLayout();
  const elapsedTimer = useElapsedTimer();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const audience = interviewAudienceFromPathname(pathname);
  const queueHref = interviewQueueHref(teamId, stage, audience);

  useEffect(() => {
    setData(null);
    setDraft(emptyDraft());
    setDrafts({});
    setInterviewPhase('case');
    setError('');
    setSubmitError('');
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
  const isPhasedInterview =
    !isGroupInterview && isPhasedCaseAndBehavioralInterview(data?.interviewGuide ?? null);
  const scoreFieldList = data ? allScoreFields(data) : [];
  const casePdfUrl =
    isPhasedInterview && interviewPhase === 'behavioral'
      ? undefined
      : data?.interviewGuide?.casePdfUrl;
  const activePhaseFields = isPhasedInterview
    ? interviewPhaseScoreFields(data?.interviewGuide ?? null, interviewPhase)
    : scoreFieldList;

  const groupCompletion = useMemo(() => {
    if (!data?.groupEntries) return { completed: 0, total: 0 };
    const total = data.groupEntries.length;
    const completed = data.groupEntries.filter((entry) =>
      isDraftComplete(drafts[entry.applicationId] ?? emptyDraft(), scoreFieldList),
    ).length;
    return { completed, total };
  }, [data?.groupEntries, drafts, scoreFieldList]);

  const scoringLocked = data?.scoringEditLock?.locked ?? false;

  const assignmentPending = useMemo(() => {
    if (!data) return false;
    if (isGroupInterview && data.groupEntries) {
      return data.groupEntries.some((entry) => !entry.isComplete);
    }
    return data.assignmentStatus !== 'completed';
  }, [data, isGroupInterview]);

  const hasDraftScores = useMemo(() => {
    if (isGroupInterview && data?.groupEntries) {
      return data.groupEntries.some((entry) => {
        const entryDraft = drafts[entry.applicationId] ?? emptyDraft();
        return scoreFieldList.some((field) => entryDraft.scores[field] !== undefined);
      });
    }
    return scoreFieldList.some((field) => draft.scores[field] !== undefined);
  }, [isGroupInterview, data?.groupEntries, drafts, draft.scores, scoreFieldList]);

  const saveSnapshot = useMemo(() => {
    if (isGroupInterview && data?.groupEntries) {
      return serializeGroupDrafts(data.groupEntries, drafts);
    }
    return serializeDraft(draft);
  }, [isGroupInterview, data?.groupEntries, drafts, draft]);

  const persistDraft = useCallback(
    async (snapshot: string) => {
      const parsed = JSON.parse(snapshot) as {
        entries?: Array<{
          applicationId: number;
          scores: Record<string, number>;
          notes: Record<string, string>;
          comment: string;
        }>;
        scores?: Record<string, number>;
        notes?: Record<string, string>;
        comment?: string;
      };
      const res = await fetch(
        `/api/team/interviews/${applicationId}/score?teamId=${teamId}&stage=${stage}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft: true, ...parsed }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Couldn't save");
      }
    },
    [applicationId, teamId, stage],
  );

  const draftsReady =
    Boolean(data) &&
    (!isGroupInterview ||
      Boolean(data?.groupEntries && data.groupEntries.every((entry) => drafts[entry.applicationId])));

  const { status: saveStatus, errorMessage: saveError } = useAutosaveStatus({
    snapshot: saveSnapshot,
    ready: draftsReady,
    resetKey: applicationId,
    enabled: draftsReady && !scoringLocked,
    persist: persistDraft,
  });

  const showAutosaveBanner =
    !scoringLocked && assignmentPending && hasDraftScores && saveStatus === 'saved';

  const switchInterviewPhase = (next: InterviewScoringPhase) => {
    if (next === interviewPhase) return;
    setSubmitError('');
    setInterviewPhase(next);
    setCaseOpen(next === 'case');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateAfterSubmit = (json: {
    nextApplicationId?: number | null;
    advancementHref?: string | null;
    isDirector?: boolean;
  }) => {
    if (json.nextApplicationId) {
      toast.success('Interview score submitted');
      router.push(interviewAppHref(teamId, stage, json.nextApplicationId, audience));
      return;
    }
    if (json.advancementHref && audience === 'team') {
      const copy = interviewCompleteGuidance(Boolean(json.isDirector));
      toast.success(copy.title);
      router.push(json.advancementHref);
      return;
    }
    toast.success(
      stage === 'first_round'
        ? interviewCompleteToast(Boolean(json.isDirector))
        : stage === 'final_round'
          ? 'All final interviews scored — wait for Admin to advance the team.'
          : 'All interviews scored',
    );
    router.push(queueHref);
  };

  const handleSingleSubmit = async () => {
    if (!data) return;
    const missing = scoreFieldList.filter((f) => draft.scores[f] === undefined);
    if (missing.length > 0) {
      const message = 'Please score all case and behavioral criteria before submitting.';
      setSubmitError(message);
      toast.error(message);
      if (isPhasedInterview) {
        const caseMissing = interviewPhaseScoreFields(data.interviewGuide, 'case').some(
          (f) => draft.scores[f] === undefined,
        );
        switchInterviewPhase(caseMissing ? 'case' : 'behavioral');
      }
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
      navigateAfterSubmit(json);
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
      toast.success(
        json.nextApplicationId ? 'Group interview scores submitted' : 'Group interview session submitted',
      );
      navigateAfterSubmit(json);
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
        onCtaClick={() => router.push(queueHref)}
      />
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  const lockMessage = data.scoringEditLock?.message ?? '';
  const autosaveBanner = showAutosaveBanner ? (
    <StatusBanner
      type="warning"
      message={
        isGroupInterview
          ? 'Auto-saved is not submitted — click Submit all in this session to finish.'
          : 'Auto-saved is not submitted — click Submit interview to finish.'
      }
    />
  ) : null;
  const pdfTitle =
    data.interviewGuide?.caseStudy?.title?.trim() ||
    (stage === 'first_round' ? 'Group case' : 'Case');

  const layoutToggle = isGroupInterview ? (
    <span data-tour="interview-layout">
      <GroupInterviewLayoutToggle
        value={layout}
        onValueChange={updateLayout}
        className="shrink-0 flex-nowrap"
      />
    </span>
  ) : null;

  const header = (
    <div data-interview-header="" className="mb-3 shrink-0 pb-2">
      <PageContainer className="py-3 sm:py-3 lg:py-3">
        <PageContent width="fluid" className="flex items-center">
          <div className="flex-1">
            <button
              onClick={() => router.push(queueHref)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
          </div>
          <div className="text-center">
            {isGroupInterview ? (
              <>
                <p className="font-heading text-base font-medium tracking-tight sm:text-lg">
                  Group interview
                </p>
                {data.slot ? (
                  <p className="text-sm text-muted-foreground">
                    {[formatSlotHeader(data.slot.scheduledAt), data.slot.location]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <span className="font-heading text-base font-medium tracking-tight">
                  {data.candidateName}
                </span>
                {isPhasedInterview ? (
                  <div className="mt-1 flex flex-col items-center gap-1.5">
                    <InterviewPhaseToggle
                      value={interviewPhase}
                      onValueChange={switchInterviewPhase}
                    />
                    {data.interviewProgress ? (
                      <p className="text-sm text-muted-foreground">
                        {formatInterviewProgressLabel(data.interviewProgress)}
                      </p>
                    ) : null}
                  </div>
                ) : data.interviewProgress ? (
                  <p className="text-sm text-muted-foreground">
                    {formatInterviewProgressLabel(data.interviewProgress)}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <PageTourHelpButton />
            <InterviewElapsedTimer {...elapsedTimer} />
            {layoutToggle}
            <span data-tour="interview-autosave">
              <DocumentSaveStatusLine
                status={saveStatus}
                errorMessage={saveError}
                savedLabel="Auto-saved"
              />
            </span>
            {casePdfUrl ? (
              <>
                <InterviewWorkspaceFullscreenButton
                  fullscreen={fullscreen}
                  onToggle={toggleFullscreen}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-tour="interview-case"
                  className="h-8 normal-case border-foreground/25 bg-background font-medium"
                  onClick={() => setCaseOpen(!caseOpen)}
                >
                  {caseOpen ? 'Close case' : 'Open case'}
                </Button>
              </>
            ) : null}
            {data.nextApplicationId ? (
              <Button
                variant="ghost"
                size="sm"
                data-tour="interview-next"
                onClick={() => {
                  const nextId = data.nextApplicationId;
                  if (nextId == null) return;
                  router.push(interviewAppHref(teamId, stage, nextId, audience));
                }}
              >
                Next →
              </Button>
            ) : null}
          </div>
        </PageContent>
      </PageContainer>
    </div>
  );

  const groupInterviewHeaderContent =
    isGroupInterview && data.groupEntries && ((scoringLocked && lockMessage) || data.slot?.logisticsNote || showAutosaveBanner) ? (
      <div className="shrink-0 space-y-1.5">
        {autosaveBanner}
        {scoringLocked && lockMessage && <StatusBanner type="info" message={lockMessage} />}
        {data.slot?.logisticsNote && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Logistics: </span>
            {data.slot.logisticsNote}
          </p>
        )}
      </div>
    ) : null;

  const groupInterviewHeader = groupInterviewHeaderContent ? (
    <PageContainer className="pb-2 pt-0">
      <PageContent width="fluid">{groupInterviewHeaderContent}</PageContent>
    </PageContainer>
  ) : null;

  const groupWorkspaceProps = isGroupInterview && data.groupEntries
    ? {
        layout,
        candidates: data.groupEntries.map((entry) => ({
          id: String(entry.applicationId),
          name: entry.candidateName,
          complete: isDraftComplete(
            drafts[entry.applicationId] ?? emptyDraft(),
            scoreFieldList,
          ),
        })),
        activeId: activeTab,
        onActiveIdChange: setActiveTab,
        guide: data.interviewGuide ?? null,
        getFormBindings: (candidate: GroupInterviewCandidate) => {
          const applicationIdForForm = Number(candidate.id);
          const entryDraft = drafts[applicationIdForForm] ?? emptyDraft();
          return {
            notes: entryDraft.notes,
            scores: entryDraft.scores,
            comment: entryDraft.comment,
            disabled: scoringLocked,
            onNoteChange: (field: string, value: string) =>
              updateDraft(applicationIdForForm, {
                notes: { ...entryDraft.notes, [field]: value },
              }),
            onScoreChange: (field: string, value: number) =>
              updateDraft(applicationIdForForm, {
                scores: { ...entryDraft.scores, [field]: value },
              }),
            onCommentChange: (value: string) =>
              updateDraft(applicationIdForForm, { comment: value }),
          };
        },
        renderForm: (candidate: GroupInterviewCandidate, { compact }: { compact: boolean }) => {
          const applicationIdForForm = Number(candidate.id);
          const entryDraft = drafts[applicationIdForForm] ?? emptyDraft();
          return (
            <NotesAndEvaluationForm
              guide={data.interviewGuide ?? null}
              draft={entryDraft}
              locked={scoringLocked}
              compact={compact}
              onNoteChange={(field, value) =>
                updateDraft(applicationIdForForm, {
                  notes: { ...entryDraft.notes, [field]: value },
                })
              }
              onScoreChange={(field, value) =>
                updateDraft(applicationIdForForm, {
                  scores: { ...entryDraft.scores, [field]: value },
                })
              }
              onCommentChange={(value) =>
                updateDraft(applicationIdForForm, { comment: value })
              }
            />
          );
        },
      }
    : null;

  const notesContent = groupWorkspaceProps ? (
    <div data-tour="interview-scores" className="flex flex-col gap-6">
      <GroupInterviewCandidateWorkspace {...groupWorkspaceProps} />
      {submitError && <StatusBanner message={submitError} type="error" />}
    </div>
  ) : (
    <div data-tour="interview-scores" className="uma-stack-page">
      {autosaveBanner}
      {scoringLocked && lockMessage && <StatusBanner type="info" message={lockMessage} />}
      {data.slot && (
        <p className="text-sm text-muted-foreground">
          {formatSlotTime(data.slot.scheduledAt)}
          {data.slot.location ? ` · ${data.slot.location}` : ''}
          {data.slot.logisticsNote ? ` · ${data.slot.logisticsNote}` : ''}
        </p>
      )}
      <InterviewNotesPanelHeader
        title={
          isPhasedInterview
            ? interviewPhase === 'case'
              ? 'Case — notes & evaluation'
              : 'Behavioral — notes & evaluation'
            : 'Notes & Evaluation'
        }
        intro={isPhasedInterview && interviewPhase === 'behavioral' ? undefined : data.interviewGuide?.intro}
      />
      <NotesAndEvaluationForm
        guide={data.interviewGuide ?? null}
        draft={draft}
        locked={scoringLocked}
        phase={isPhasedInterview ? interviewPhase : undefined}
        onNoteChange={(field, value) =>
          setDraft((prev) => ({ ...prev, notes: { ...prev.notes, [field]: value } }))
        }
        onScoreChange={(field, value) =>
          setDraft((prev) => ({ ...prev, scores: { ...prev.scores, [field]: value } }))
        }
        onCommentChange={(value) => setDraft((prev) => ({ ...prev, comment: value }))}
      />
      {submitError && <StatusBanner message={submitError} type="error" />}
    </div>
  );

  const groupFooter = (
    <div
      data-tour="interview-submit"
      className={cn(
        'flex items-center justify-between gap-4',
        casePdfUrl
          ? 'shrink-0 border-t border-border/25 bg-muted/35 px-6 py-3.5 sm:px-7 lg:px-8'
          : 'pt-2',
      )}
    >
      <div className="flex-1">
        <div className="h-2 w-full overflow-hidden rounded-full border border-border/35 bg-background/60">
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
        <p className="mt-0.5 text-xs text-muted-foreground/85">
          {groupCompletion.completed} of {groupCompletion.total} applicants scored
        </p>
      </div>
      <LoadingButton
        onClick={handleGroupSubmit}
        loading={submitting}
        disabled={scoringLocked}
      >
        {scoringLocked ? 'Editing locked' : 'Submit all in this session'}
      </LoadingButton>
    </div>
  );

  const singleFooter = isPhasedInterview ? (
    <div
      data-tour="interview-submit"
      className={cn(
        'flex items-center justify-between gap-4',
        interviewPhase === 'case' && casePdfUrl
          ? 'shrink-0 border-t border-border/25 bg-muted/35 px-6 py-3.5 sm:px-7 lg:px-8'
          : 'pt-2',
      )}
    >
      <InterviewPhaseToggle
        value={interviewPhase}
        onValueChange={switchInterviewPhase}
      />
      <div className="flex items-center gap-3">
        <span className="text-sm tabular-nums text-muted-foreground">
          {activePhaseFields.filter((f) => draft.scores[f] !== undefined).length}/
          {activePhaseFields.length} this part ·{' '}
          {scoreFieldList.filter((f) => draft.scores[f] !== undefined).length}/
          {scoreFieldList.length} total
        </span>
        <LoadingButton
          onClick={handleSingleSubmit}
          loading={submitting}
          disabled={scoringLocked}
        >
          {scoringLocked ? 'Editing locked' : 'Submit interview →'}
        </LoadingButton>
      </div>
    </div>
  ) : (
    <div data-tour="interview-submit">
      <GradingSubmitFooter
        variant={casePdfUrl ? 'embedded' : 'sticky'}
        scoredCount={scoreFieldList.filter((f) => draft.scores[f] !== undefined).length}
        totalScored={scoreFieldList.length}
        onSubmit={handleSingleSubmit}
        submitting={submitting}
        locked={scoringLocked}
      />
    </div>
  );

  const footer = isGroupInterview ? groupFooter : singleFooter;

  if (casePdfUrl) {
    return (
      <div
        data-interview-fill=""
        className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
      >
        <InterviewStickyLead>
          {header}
          <InterviewFullscreenEvalBar>
            <PageTourHelpButton />
            <InterviewElapsedTimer {...elapsedTimer} />
            {layoutToggle}
            <InterviewWorkspaceExitFullscreenButton onExit={exitFullscreen} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-tour="interview-case"
              className="h-8 normal-case border-foreground/25 bg-background font-medium"
              onClick={() => setCaseOpen(!caseOpen)}
            >
              {caseOpen ? 'Close case' : 'Open case'}
            </Button>
          </InterviewFullscreenEvalBar>
        </InterviewStickyLead>
        {groupInterviewHeader}
        <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
          {groupWorkspaceProps ? (
            <GroupInterviewCandidateWorkspace
              {...groupWorkspaceProps}
              render={({ chrome, body }) => (
                <InterviewCaseEvalSplit
                  caseUrl={casePdfUrl}
                  caseTitle={pdfTitle}
                  candidateCount={data.groupEntries?.length ?? 1}
                  caseOpen={caseOpen}
                  onCaseOpenChange={setCaseOpen}
                  fullscreen={fullscreen}
                  notesChrome={chrome}
                  notes={
                    <div data-tour="interview-scores" className="flex flex-col gap-6">
                      {body}
                      {submitError && <StatusBanner message={submitError} type="error" />}
                    </div>
                  }
                  footer={footer}
                />
              )}
            />
          ) : (
            <InterviewCaseEvalSplit
              caseUrl={casePdfUrl}
              caseTitle={pdfTitle}
              candidateCount={1}
              caseOpen={caseOpen}
              onCaseOpenChange={setCaseOpen}
              fullscreen={fullscreen}
              notes={notesContent}
              footer={footer}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      <PageContainer>
        <PageContent width="wide" className="uma-stack-page">
          {groupInterviewHeaderContent}
          {notesContent}
          {footer}
        </PageContent>
      </PageContainer>
    </>
  );
}
