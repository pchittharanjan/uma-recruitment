'use client';

import React, { use, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageContent, PageHeader } from '@/components/page-shell';
import { ApplicationQuestionRubricCard } from '@/components/application-question-rubric';
import { PortfolioLinkPreview } from '@/components/portfolio-link-preview';
import { ResponseText } from '@/components/response-text';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import { applicantDisplayId } from '@/lib/blind';
import ScoreSelector from '@/components/ScoreSelector';
import StatusBanner from '@/components/status-banner';
import { RequiredAsterisk } from '@/components/ui/label';
import {
  invalidateTeamGradeData,
  loadGradeData,
  prefetchNextPendingGradeData,
  type GradeAppData,
} from '@/lib/grading-client';
import { primaryScoredQuestions, questionsLinkedTo } from '@/lib/grading-model';
import { gradingCompleteToast, FIVE_LEVEL_RATING_PHRASE } from '@/lib/next-step-guidance';
import { gradingAppHref, gradingQueueHref } from '@/lib/grading-paths';
import { cn } from '@/lib/utils';
import { useOptionalShellUser } from '@/components/shell-user-provider';
import type { TeamName } from '@/lib/db';

export default function TeamGradingScorePage({
  params,
}: {
  params: Promise<{ teamId: string; applicationId: string }>;
}) {
  const { teamId, applicationId } = use(params);
  const [appData, setAppData] = useState<GradeAppData | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const audience = pathname.startsWith('/admin/') ? 'admin' : 'team';
  const shell = useOptionalShellUser();
  const teamName = shell?.teams.find((team) => String(team.id) === teamId)?.name as
    | TeamName
    | undefined;

  useEffect(() => {
    let cancelled = false;
    setAppData(null);
    setError('');
    setSubmitError('');

    loadGradeData(teamId, applicationId, teamName)
      .then((d) => {
        if (cancelled) return;
        setAppData(d);
        setScores(d.existingScores ?? {});
        setNotes(d.existingNotes ?? {});
        setComment(d.existingComment ?? '');
        // Warm the cache for the next pending applicant so submit → next is instant.
        void prefetchNextPendingGradeData(teamId, d.applicationId);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Network error');
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, applicationId, teamName]);

  const gradingLocked = appData?.gradingEditLock?.locked ?? false;
  const scoredQuestions = appData
    ? primaryScoredQuestions(appData.applicationQuestions ?? [])
    : [];
  const usesCriterionRubric = scoredQuestions.length > 0;
  const allScoredFields = appData
    ? usesCriterionRubric
      ? [...(appData.customScoreFields ?? [])]
      : [...appData.scoreFields, ...(appData.customScoreFields ?? [])]
    : [];
  const activeField = allScoredFields.find((f) => scores[f] === undefined) ?? null;

  const handleSubmit = useCallback(async () => {
    if (!appData || submitting) return;
    const allFields = usesCriterionRubric
      ? [...(appData.customScoreFields ?? [])]
      : [...appData.scoreFields, ...(appData.customScoreFields ?? [])];
    const missing = allFields.filter((f) => scores[f] === undefined);
    if (missing.length > 0) {
      const message = 'Please score all fields before submitting.';
      setSubmitError(message);
      toast.error(message);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/team/grading/${applicationId}/score?teamId=${teamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, notes, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error);
        toast.error(data.error ?? 'Failed to submit score');
        return;
      }
      // Drop prefetched payloads — they were fetched before this submit, so
      // "X of Y done" would still show the old count. Warm the real next app.
      invalidateTeamGradeData(teamId);
      const nextAudience = data.isAdminGrader || audience === 'admin' ? 'admin' : 'team';
      if (data.nextApplicationId) {
        toast.success('Score submitted');
        await loadGradeData(teamId, data.nextApplicationId, teamName).catch(() => {});
        router.push(gradingAppHref(teamId, data.nextApplicationId, nextAudience));
      } else if (data.advancementHref && nextAudience === 'team') {
        toast.success(
          gradingCompleteToast(Boolean(data.isDirector), Boolean(data.isAdminGrader) || audience === 'admin'),
        );
        router.push(data.advancementHref);
      } else {
        toast.success(
          gradingCompleteToast(Boolean(data.isDirector), Boolean(data.isAdminGrader) || audience === 'admin'),
        );
        router.push(gradingQueueHref(teamId, nextAudience));
      }
    } catch {
      setSubmitError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [appData, applicationId, audience, comment, notes, router, scores, submitting, teamId, teamName, usesCriterionRubric]);

  const scoreField = useCallback(
    (field: string, n: number) => {
      setScores((prev) => ({ ...prev, [field]: n }));
    },
    [],
  );

  // Keyboard flow: 1–5 scores the first unscored field, ⌘/Ctrl+Enter submits.
  const activeFieldRef = useRef(activeField);
  activeFieldRef.current = activeField;
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (gradingLocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSubmitRef.current();
        return;
      }

      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= '1' && e.key <= '5') {
        const field = activeFieldRef.current;
        if (!field) return;
        e.preventDefault();
        setScores((prev) => ({ ...prev, [field]: Number(e.key) }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gradingLocked]);

  // Keep the field being scored in view as grading advances (not on first load).
  useEffect(() => {
    if (!activeField || !appData) return;
    if (Object.keys(scores).length === 0) return;
    const el = document.querySelector(`[data-score-field="${CSS.escape(activeField)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeField, appData]);

  if (error) {
    return (
      <CenteredMessage
        title="Couldn't load application"
        description={error}
        ctaLabel="Back"
        onCtaClick={() => router.push(gradingQueueHref(teamId, audience))}
      />
    );
  }

  if (!appData) {
    return <PageLoading />;
  }

  const renderWithLinks = (text: string) => <ResponseText text={text} />;

  const contextFields = appData.contextFields ?? [];
  const scoredCount = allScoredFields.filter((f) => scores[f] !== undefined).length;
  const totalScored = allScoredFields.length;
  const lockMessage = appData.gradingEditLock?.message ?? '';
  const isLastPending =
    !gradingLocked &&
    appData.graderProgress.total > 0 &&
    appData.graderProgress.completed === appData.graderProgress.total - 1;

  return (
    <>
      <div
        className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur"
        data-tour="grade-form-nav"
      >
        <PageContainer className="py-3 sm:py-3 lg:py-3">
          <PageContent
            width="comfortable"
            className="flex items-center justify-between gap-3"
          >
            <button
              type="button"
              onClick={() => router.push(gradingQueueHref(teamId, audience))}
              className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            <div className="min-w-0 flex-1 text-center">
              <span className="text-sm font-medium">
                {applicantDisplayId(appData.rowIndex)}
              </span>
              <p className="text-sm text-muted-foreground">
                {appData.graderProgress.completed} of {appData.graderProgress.total} done
              </p>
            </div>
            <span
              className="shrink-0 text-sm tabular-nums text-muted-foreground"
              data-tour="grade-form-progress"
            >
              {scoredCount}/{totalScored} scored
            </span>
          </PageContent>
        </PageContainer>
      </div>

      <PageContainer className="py-6 sm:py-6 lg:py-6">
        <PageContent width="comfortable" className="uma-stack-page pb-8">
          {gradingLocked && <StatusBanner type="info" message={lockMessage} />}

          {isLastPending && (
            <StatusBanner
              type="info"
              message={
                appData.isAdminGrader
                  ? 'Last application in your queue. After you submit, you’ll return to the name-blind list.'
                  : appData.isDirector
                    ? `Last application in your queue. After you submit, set ${FIVE_LEVEL_RATING_PHRASE}, then meet with your PMs.`
                    : `Last application in your queue. After you submit, set ${FIVE_LEVEL_RATING_PHRASE} on who should move forward.`
              }
            />
          )}

          {appData.graderInstructions && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="mb-1 uma-section-label text-amber-700 dark:text-amber-300">
                Instructions
              </p>
              <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">
                {appData.graderInstructions}
              </p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section
              className={cn('uma-stack-section', !appData.showPortfolioSection && 'lg:col-span-2')}
              data-tour="grade-form-scores"
            >
              <h2 className="uma-section-label">Written responses</h2>

              {contextFields.length > 0 && (
                <Card className="p-4 sm:p-5">
                  <p className="mb-3 uma-section-label">
                    Application context
                  </p>
                  <div className="space-y-3">
                    {contextFields.map((field) => {
                      const val = appData.fields[field] || '-';
                      return (
                        <div key={field} className="flex min-w-0 gap-3">
                          <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">
                            {field}
                          </span>
                          <span className="min-w-0 break-words text-sm">
                            <ResponseText text={val} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {usesCriterionRubric ? (
                scoredQuestions.map((question) => (
                  <Card key={question.id} className="p-4 sm:p-5">
                    <ApplicationQuestionRubricCard
                      question={question}
                      linkedQuestions={questionsLinkedTo(
                        appData.applicationQuestions,
                        question.id,
                      )}
                      scores={scores}
                      notes={notes[question.id] ?? ''}
                      activeField={activeField}
                      disabled={gradingLocked}
                      onScore={scoreField}
                      onNotesChange={(value) =>
                        setNotes((prev) => ({ ...prev, [question.id]: value }))
                      }
                      renderResponse={renderWithLinks}
                      fields={appData.fields}
                    />
                  </Card>
                ))
              ) : (
                <>
              {appData.scoreFields.map((field) => (
                <Card
                  key={field}
                  data-score-field={field}
                  className={cn(
                    'p-4 sm:p-5',
                    !gradingLocked && field === activeField && 'ring-2 ring-primary/40',
                  )}
                >
                  <p className="mb-2 uma-section-label text-primary">
                    {field}
                    <RequiredAsterisk className="ml-0.5" />
                  </p>
                  <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">
                    {appData.fields[field] ? (
                      renderWithLinks(appData.fields[field])
                    ) : (
                      <span className="italic text-muted-foreground">No response</span>
                    )}
                  </p>
                  <div className="grid grid-cols-1 items-stretch gap-4 pt-4 sm:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
                    <div className="order-2 sm:order-1">
                      <p className="mb-2 text-sm text-muted-foreground">
                        Score (1–5)
                        <RequiredAsterisk className="ml-0.5" />
                      </p>
                      <ScoreSelector
                        value={scores[field] ?? null}
                        onChange={(n) => scoreField(field, n)}
                        disabled={gradingLocked}
                      />
                    </div>
                    <div className="order-1 flex min-h-[7.5rem] min-w-0 flex-col sm:order-2">
                      <label htmlFor={`notes-${field}`} className="mb-2 uma-section-label">
                        Notes
                      </label>
                      <textarea
                        id={`notes-${field}`}
                        value={notes[field] ?? ''}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        placeholder="Notes for this question…"
                        rows={3}
                        disabled={gradingLocked}
                        className="field-textarea min-h-[7.5rem] w-full flex-1 resize-y disabled:opacity-60"
                      />
                    </div>
                  </div>
                </Card>
              ))}

              {(appData.customScoreFields ?? []).map((field) => (
                <Card
                  key={`custom:${field}`}
                  data-score-field={field}
                  className={cn(
                    'p-4 sm:p-5',
                    !gradingLocked && field === activeField && 'ring-2 ring-primary/40',
                  )}
                >
                  <p className="mb-4 uma-section-label text-primary">
                    {field}
                    <RequiredAsterisk className="ml-0.5" />
                  </p>
                  <div className="grid grid-cols-1 items-stretch gap-4 pt-4 sm:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
                    <div className="order-2 sm:order-1">
                      <p className="mb-2 text-sm text-muted-foreground">
                        Score (1–5)
                        <RequiredAsterisk className="ml-0.5" />
                      </p>
                      <ScoreSelector
                        value={scores[field] ?? null}
                        onChange={(n) => scoreField(field, n)}
                        disabled={gradingLocked}
                      />
                    </div>
                    <div className="order-1 flex min-h-[7.5rem] min-w-0 flex-col sm:order-2">
                      <label htmlFor={`notes-custom-${field}`} className="mb-2 uma-section-label">
                        Notes
                      </label>
                      <textarea
                        id={`notes-custom-${field}`}
                        value={notes[field] ?? ''}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [field]: e.target.value }))
                        }
                        placeholder="Notes for this question…"
                        rows={3}
                        disabled={gradingLocked}
                        className="field-textarea min-h-[7.5rem] w-full flex-1 resize-y disabled:opacity-60"
                      />
                    </div>
                  </div>
                </Card>
              ))}
                </>
              )}
            </section>

            {appData.showPortfolioSection ? (
            <section className="uma-stack-section" data-tour="grade-form-portfolio">
              <h2 className="uma-section-label">Portfolio &amp; supplementary</h2>
              <Card className="p-4 sm:p-5">
                {Object.keys(appData.portfolioFields ?? {}).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No portfolio links for this applicant.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {Object.entries(appData.portfolioFields ?? {}).map(([field, val]) => (
                      <div key={field} className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">{field}</p>
                        {val.startsWith('http://') || val.startsWith('https://') ? (
                          <PortfolioLinkPreview
                            url={val}
                            openLabel={`${applicantDisplayId(appData.rowIndex)} - Portfolio`}
                            blind
                          />
                        ) : (
                          <p className="text-sm">{val}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
            ) : null}
          </div>

          <Card className="p-4 sm:p-5" data-tour="grade-form-comments">
            <p className="mb-2 uma-section-label">
              Overall comments
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything else for this application (not tied to one question)"
              rows={3}
              disabled={gradingLocked}
              className="field-textarea resize-none disabled:opacity-60"
            />
          </Card>

          {submitError && <StatusBanner message={submitError} type="error" />}

          {!gradingLocked && (
            <p className="text-center text-xs text-muted-foreground">
              Tip: press <kbd className="rounded border px-1">1</kbd>–
              <kbd className="rounded border px-1">5</kbd> to score the highlighted field ·{' '}
              <kbd className="rounded border px-1">⌘</kbd>+
              <kbd className="rounded border px-1">Enter</kbd> to submit
            </p>
          )}

          <GradingSubmitFooter
            scoredCount={scoredCount}
            totalScored={totalScored}
            onSubmit={handleSubmit}
            submitting={submitting}
            locked={gradingLocked}
          />
        </PageContent>
      </PageContainer>
    </>
  );
}
