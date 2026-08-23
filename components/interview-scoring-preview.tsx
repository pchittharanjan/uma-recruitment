'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InterviewElapsedTimer } from '@/components/interview-elapsed-timer';
import LoadingButton from '@/components/loading-button';
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
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import ScoreSelector from '@/components/ScoreSelector';
import { InterviewNotesAndScoringForm } from '@/components/interview-question-eval';
import {
  DocumentSaveStatusLine,
} from '@/components/document-save-status';
import {
  GroupInterviewCandidateWorkspace,
  GroupInterviewLayoutToggle,
  GroupInterviewReadOnlyNames,
  InterviewNotesPanelHeader,
  useGroupInterviewLayout,
  type GroupInterviewCandidate,
} from '@/components/group-interview-candidate-workspace';
import { useAutosaveStatus } from '@/hooks/use-autosave-status';
import { useElapsedTimer } from '@/hooks/use-elapsed-timer';
import {
  interviewScaleMax,
  interviewScoreFieldGroups,
  interviewStageSetupCopy,
  type InterviewGuide,
  type InterviewGuideStage,
} from '@/lib/interview-guide';
interface PreviewCandidateDraft {
  scores: Record<string, number>;
  notes: Record<string, string>;
  comment: string;
}

const SAMPLE_APPLICANTS = [
  { id: 1, name: 'Alex Chen' },
  { id: 2, name: 'Jordan Lee' },
  { id: 3, name: 'Maya Patel' },
  { id: 4, name: 'Ryan Kim' },
] as const;

const SAMPLE_APPLICANT_NAME = 'Sample Applicant';

function emptyDraft(): PreviewCandidateDraft {
  return { scores: {}, notes: {}, comment: '' };
}

function emptyDrafts(): Record<number, PreviewCandidateDraft> {
  const initial: Record<number, PreviewCandidateDraft> = {};
  for (const applicant of SAMPLE_APPLICANTS) {
    initial[applicant.id] = emptyDraft();
  }
  return initial;
}

function allScoreFields(guide: InterviewGuide): string[] {
  return interviewScoreFieldGroups(guide).flatMap((group) => group.fields);
}

function isDraftComplete(draft: PreviewCandidateDraft, fields: string[]): boolean {
  return fields.length > 0 && fields.every((field) => draft.scores[field] !== undefined);
}

function serializePreviewDraft(draft: PreviewCandidateDraft): string {
  return JSON.stringify({
    scores: draft.scores,
    notes: draft.notes,
    comment: draft.comment,
  });
}

function serializePreviewDrafts(drafts: Record<number, PreviewCandidateDraft>): string {
  return JSON.stringify(
    SAMPLE_APPLICANTS.map((applicant) => ({
      id: applicant.id,
      ...(drafts[applicant.id] ?? emptyDraft()),
    })),
  );
}

function NotesAndEvaluationForm({
  guide,
  draft,
  disabled,
  compact,
  onNoteChange,
  onScoreChange,
  onCommentChange,
}: {
  guide: InterviewGuide;
  draft: PreviewCandidateDraft;
  disabled: boolean;
  compact?: boolean;
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
      disabled={disabled}
      compact={compact}
      onNoteChange={onNoteChange}
      onScoreChange={onScoreChange}
      onCommentChange={onCommentChange}
    />
  );
}

function ReadOnlySubmitPlaceholder({
  fieldCount,
  scaleMax,
}: {
  fieldCount: number;
  scaleMax: number;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 opacity-90">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Submit (preview)
      </p>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Interviewers score every rubric item, then submit to move to the next applicant.
      </p>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">0 of {fieldCount} scored</span>
        <ScoreSelector value={null} onChange={() => {}} disabled max={scaleMax} />
      </div>
    </div>
  );
}

export function InterviewScoringPreview({
  guide,
  stage,
  teamName,
  showGroupSample = false,
  interactive = false,
}: {
  guide: InterviewGuide;
  stage: InterviewGuideStage;
  teamName: string;
  showGroupSample?: boolean;
  interactive?: boolean;
}) {
  const scoreFieldList = allScoreFields(guide);
  const casePdfUrl = guide.casePdfUrl;
  const stageCopy = interviewStageSetupCopy(teamName, stage);
  const scaleMax = interviewScaleMax(guide);
  const pdfTitle =
    guide.caseStudy?.title?.trim() ||
    (stage === 'first_round' ? 'Group case' : 'Case');

  const [draft, setDraft] = useState<PreviewCandidateDraft>(emptyDraft);
  const [drafts, setDrafts] = useState<Record<number, PreviewCandidateDraft>>(emptyDrafts);
  const [activeTab, setActiveTab] = useState(String(SAMPLE_APPLICANTS[0].id));
  const [submitting, setSubmitting] = useState(false);
  const [caseOpen, setCaseOpen] = useInterviewCaseOpen();
  const { fullscreen, exit: exitFullscreen, toggle: toggleFullscreen } =
    useInterviewWorkspaceFullscreen();
  const { layout, updateLayout } = useGroupInterviewLayout();
  const elapsedTimer = useElapsedTimer();

  const disabled = !interactive;

  const saveSnapshot = useMemo(
    () => (showGroupSample ? serializePreviewDrafts(drafts) : serializePreviewDraft(draft)),
    [showGroupSample, drafts, draft],
  );

  const persistPreview = useCallback(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 280));
  }, []);

  const { status: saveStatus, errorMessage: saveError } = useAutosaveStatus({
    snapshot: saveSnapshot,
    ready: interactive,
    enabled: interactive,
    warnOnLeave: false,
    persist: persistPreview,
  });

  const groupCompletion = useMemo(() => {
    if (!showGroupSample) return { completed: 0, total: 0 };
    const total = SAMPLE_APPLICANTS.length;
    const completed = SAMPLE_APPLICANTS.filter((applicant) =>
      isDraftComplete(drafts[applicant.id] ?? emptyDraft(), scoreFieldList),
    ).length;
    return { completed, total };
  }, [showGroupSample, drafts, scoreFieldList]);

  const updateDraft = (appId: number, patch: Partial<PreviewCandidateDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [appId]: { ...(prev[appId] ?? emptyDraft()), ...patch },
    }));
  };

  const handlePreviewSubmit = async () => {
    const missing = scoreFieldList.filter((field) => draft.scores[field] === undefined);
    if (missing.length > 0) {
      toast.error('Please score all questions before submitting.');
      return;
    }
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setSubmitting(false);
    toast.info('Preview mode: scores are not saved.');
  };

  const handleGroupPreviewSubmit = async () => {
    const incomplete = SAMPLE_APPLICANTS.filter(
      (applicant) => !isDraftComplete(drafts[applicant.id] ?? emptyDraft(), scoreFieldList),
    );
    if (incomplete.length > 0) {
      toast.error(
        `Please score all questions for every applicant (${incomplete.length} remaining).`,
      );
      setActiveTab(String(incomplete[0].id));
      return;
    }
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setSubmitting(false);
    toast.info('Preview mode: scores are not saved.');
  };

  const previewNextApplicant = () => {
    toast.info('Preview only: no next applicant.');
  };

  const singleSubmitFooter = interactive ? (
    <GradingSubmitFooter
      variant="embedded"
      scoredCount={scoreFieldList.filter((field) => draft.scores[field] !== undefined).length}
      totalScored={scoreFieldList.length}
      onSubmit={handlePreviewSubmit}
      submitting={submitting}
    />
  ) : (
    <ReadOnlySubmitPlaceholder
      fieldCount={scoreFieldList.length}
      scaleMax={scaleMax}
    />
  );

  const groupSubmitFooter = interactive ? (
    <div className="flex shrink-0 flex-col gap-4 border-t border-border/25 bg-muted/35 px-6 py-3.5 sm:px-7 lg:px-8">
      <div className="flex items-center justify-between gap-4">
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
          onClick={handleGroupPreviewSubmit}
          loading={submitting}
        >
          Submit all →
        </LoadingButton>
      </div>
    </div>
  ) : null;

  const groupWorkspaceProps = showGroupSample && interactive
    ? {
        layout,
        candidates: SAMPLE_APPLICANTS.map((applicant) => ({
          id: String(applicant.id),
          name: applicant.name,
          complete: isDraftComplete(drafts[applicant.id] ?? emptyDraft(), scoreFieldList),
        })),
        activeId: activeTab,
        onActiveIdChange: setActiveTab,
        guide,
        getFormBindings: (candidate: GroupInterviewCandidate) => {
          const applicantId = Number(candidate.id);
          const entryDraft = drafts[applicantId] ?? emptyDraft();
          return {
            notes: entryDraft.notes,
            scores: entryDraft.scores,
            comment: entryDraft.comment,
            disabled,
            onNoteChange: (field: string, value: string) =>
              updateDraft(applicantId, {
                notes: { ...entryDraft.notes, [field]: value },
              }),
            onScoreChange: (field: string, value: number) =>
              updateDraft(applicantId, {
                scores: { ...entryDraft.scores, [field]: value },
              }),
            onCommentChange: (value: string) => updateDraft(applicantId, { comment: value }),
          };
        },
        renderForm: (candidate: GroupInterviewCandidate, { compact }: { compact: boolean }) => {
          const applicantId = Number(candidate.id);
          const entryDraft = drafts[applicantId] ?? emptyDraft();
          return (
            <NotesAndEvaluationForm
              guide={guide}
              draft={entryDraft}
              disabled={disabled}
              compact={compact}
              onNoteChange={(field, value) =>
                updateDraft(applicantId, {
                  notes: { ...entryDraft.notes, [field]: value },
                })
              }
              onScoreChange={(field, value) =>
                updateDraft(applicantId, {
                  scores: { ...entryDraft.scores, [field]: value },
                })
              }
              onCommentChange={(value) => updateDraft(applicantId, { comment: value })}
            />
          );
        },
      }
    : null;

  const notesContent = showGroupSample ? (
    <div data-tour="interview-scores" className="flex flex-col gap-6">
      {groupWorkspaceProps ? (
        <GroupInterviewCandidateWorkspace {...groupWorkspaceProps} />
      ) : (
        <>
          <GroupInterviewReadOnlyNames
            names={SAMPLE_APPLICANTS.map((applicant) => applicant.name)}
          />
          <h3 className="text-lg font-semibold">{SAMPLE_APPLICANTS[0].name}</h3>
          <InterviewNotesAndScoringForm
            guide={guide}
            notes={{}}
            scores={{}}
            comment=""
            disabled
            onNoteChange={() => {}}
            onScoreChange={() => {}}
            onCommentChange={() => {}}
          />
        </>
      )}
    </div>
  ) : (
    <div data-tour="interview-scores" className="uma-stack-page">
      <InterviewNotesPanelHeader title="Notes & Evaluation" intro={guide.intro} />
      {interactive ? (
        <NotesAndEvaluationForm
          guide={guide}
          draft={draft}
          disabled={disabled}
          onNoteChange={(field, value) =>
            setDraft((prev) => ({ ...prev, notes: { ...prev.notes, [field]: value } }))
          }
          onScoreChange={(field, value) =>
            setDraft((prev) => ({ ...prev, scores: { ...prev.scores, [field]: value } }))
          }
          onCommentChange={(value) => setDraft((prev) => ({ ...prev, comment: value }))}
        />
      ) : (
        <InterviewNotesAndScoringForm
          guide={guide}
          notes={{}}
          scores={{}}
          comment=""
          disabled
          onNoteChange={() => {}}
          onScoreChange={() => {}}
          onCommentChange={() => {}}
        />
      )}

      {!casePdfUrl ? singleSubmitFooter : null}
    </div>
  );

  const panelFooter = showGroupSample ? groupSubmitFooter : singleSubmitFooter;
  const layoutToggle =
    showGroupSample && interactive ? (
      <span data-tour="interview-layout">
        <GroupInterviewLayoutToggle
          value={layout}
          onValueChange={updateLayout}
          className="shrink-0 flex-nowrap"
        />
      </span>
    ) : null;

  const headerRow = (
    <div
      data-interview-header=""
      className="flex shrink-0 items-start justify-between gap-4"
    >
      <div className="min-w-0 pb-2">
        <h1 className="font-heading text-xl font-medium tracking-tight text-foreground sm:text-2xl">
          {showGroupSample ? 'Group interview' : SAMPLE_APPLICANT_NAME}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {showGroupSample ? 'Sample Date & Time · Sample Room' : stageCopy.label}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-1">
        <PageTourHelpButton />
        <InterviewElapsedTimer {...elapsedTimer} />
        {layoutToggle}
        {interactive ? (
          <DocumentSaveStatusLine
            status={saveStatus}
            errorMessage={saveError}
            savedLabel="Auto-saved"
          />
        ) : null}
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
        {interactive && !showGroupSample ? (
          <Button type="button" variant="ghost" size="sm" onClick={previewNextApplicant}>
            Next →
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (casePdfUrl) {
    return (
      <div
        data-interview-fill=""
        className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
      >
        <InterviewStickyLead>
          <div className={showGroupSample ? 'mb-3' : 'mb-4'}>{headerRow}</div>
          <InterviewFullscreenEvalBar className="px-0">
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {groupWorkspaceProps ? (
            <GroupInterviewCandidateWorkspace
              {...groupWorkspaceProps}
              render={({ chrome, body }) => (
                <InterviewCaseEvalSplit
                  caseUrl={casePdfUrl}
                  caseTitle={pdfTitle}
                  candidateCount={SAMPLE_APPLICANTS.length}
                  caseOpen={caseOpen}
                  onCaseOpenChange={setCaseOpen}
                  fullscreen={fullscreen}
                  notesChrome={chrome}
                  notes={<div data-tour="interview-scores">{body}</div>}
                  footer={panelFooter}
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
              footer={panelFooter}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="uma-stack-page">
      <div className={showGroupSample ? 'mb-3' : 'mb-4'}>{headerRow}</div>
      {notesContent}
    </div>
  );
}
