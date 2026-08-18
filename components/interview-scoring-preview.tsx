'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import LoadingButton from '@/components/loading-button';
import { CasePdfPane } from '@/components/case-pdf-pane';
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import ScoreSelector from '@/components/ScoreSelector';
import { InterviewNotesAndScoringForm } from '@/components/interview-question-eval';
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

function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

function NotesPanelHeader({ title, intro }: { title: string; intro?: string }) {
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
  disabled,
  onNoteChange,
  onScoreChange,
  onCommentChange,
}: {
  guide: InterviewGuide;
  draft: PreviewCandidateDraft;
  disabled: boolean;
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

  const disabled = !interactive;

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
    <div className="flex shrink-0 flex-col gap-4 border-t border-border bg-muted/50 px-6 py-4 sm:px-7 lg:px-8">
      <div className="flex items-center justify-between gap-4">
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
          onClick={handleGroupPreviewSubmit}
          loading={submitting}
        >
          Submit all →
        </LoadingButton>
      </div>
    </div>
  ) : null;

  const notesContent = showGroupSample ? (
    <div className="space-y-8">
      <NotesPanelHeader title="Notes & Evaluation" intro={guide.intro} />
      {interactive ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-fit max-w-full flex-wrap justify-start">
            {SAMPLE_APPLICANTS.map((applicant) => {
              const complete = isDraftComplete(
                drafts[applicant.id] ?? emptyDraft(),
                scoreFieldList,
              );
              return (
                <TabsTrigger key={applicant.id} value={String(applicant.id)}>
                  {firstName(applicant.name)}
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

          {SAMPLE_APPLICANTS.map((applicant) => {
            const entryDraft = drafts[applicant.id] ?? emptyDraft();
            return (
              <TabsContent
                key={applicant.id}
                value={String(applicant.id)}
                className="space-y-4"
              >
                <h3 className="text-lg font-semibold">{applicant.name}</h3>
                <NotesAndEvaluationForm
                  guide={guide}
                  draft={entryDraft}
                  disabled={disabled}
                  onNoteChange={(field, value) =>
                    updateDraft(applicant.id, {
                      notes: { ...entryDraft.notes, [field]: value },
                    })
                  }
                  onScoreChange={(field, value) =>
                    updateDraft(applicant.id, {
                      scores: { ...entryDraft.scores, [field]: value },
                    })
                  }
                  onCommentChange={(value) => updateDraft(applicant.id, { comment: value })}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <>
          <div className="flex flex-wrap gap-2.5">
            {SAMPLE_APPLICANTS.map((applicant) => (
              <span
                key={applicant.id}
                className="inline-flex items-center rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium"
              >
                {firstName(applicant.name)}
              </span>
            ))}
          </div>
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
    <div className="space-y-8">
      <NotesPanelHeader title="Notes & Evaluation" intro={guide.intro} />
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

  const headerLabel = showGroupSample
    ? `Group interview · Sample slot · ${stageCopy.label}`
    : `${SAMPLE_APPLICANT_NAME} · ${stageCopy.label}`;

  const headerRow = (
    <div className="mb-4 flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-muted-foreground">{headerLabel}</p>
      {interactive && !showGroupSample ? (
        <Button type="button" variant="ghost" size="sm" onClick={previewNextApplicant}>
          Next →
        </Button>
      ) : null}
    </div>
  );

  if (casePdfUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {headerRow}
        <div className="grid min-h-[calc(100svh-9rem)] flex-1 grid-cols-1 overflow-hidden rounded-xl bg-surface-panel lg:grid-cols-2">
          <CasePdfPane url={casePdfUrl} title={pdfTitle} />
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-7 lg:p-8">
              {notesContent}
            </div>
            {panelFooter}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {headerRow}
      {notesContent}
    </div>
  );
}
