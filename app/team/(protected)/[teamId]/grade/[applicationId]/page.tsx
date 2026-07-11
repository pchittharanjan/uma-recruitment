'use client';

import React, { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageContent } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { GradingSubmitFooter } from '@/components/grading-submit-footer';
import { applicantDisplayId } from '@/lib/blind';
import ScoreSelector from '@/components/ScoreSelector';
import StatusBanner from '@/components/status-banner';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';

interface AppData {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingComment: string;
  graderProgress: { total: number; completed: number };
  scoreFields: string[];
  contextFields: string[];
  customScoreFields: string[];
  graderInstructions: string | null;
  gradingEditLock: GradingEditLock;
}

export default function TeamGradingScorePage({
  params,
}: {
  params: Promise<{ teamId: string; applicationId: string }>;
}) {
  const { teamId, applicationId } = use(params);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/team/grading/${applicationId}?teamId=${teamId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setAppData(d);
        setScores(d.existingScores ?? {});
        setComment(d.existingComment ?? '');
      })
      .catch(() => setError('Network error'));
  }, [teamId, applicationId]);

  const handleSubmit = async () => {
    if (!appData) return;
    const allFields = [...appData.scoreFields, ...(appData.customScoreFields ?? [])];
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
        body: JSON.stringify({ scores, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error);
        toast.error(data.error ?? 'Failed to submit score');
        return;
      }
      toast.success('Score submitted');
      if (data.nextApplicationId) {
        router.push(`/team/${teamId}/grade/${data.nextApplicationId}`);
      } else {
        router.push(`/team/${teamId}`);
      }
    } catch {
      setSubmitError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <PageContainer className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-sm p-8 text-center">
          <p className="mb-4 text-4xl">❌</p>
          <p>{error}</p>
          <LoadingButton className="mt-4" onClick={() => router.push(`/team/${teamId}`)}>
            ← Back
          </LoadingButton>
        </Card>
      </PageContainer>
    );
  }

  if (!appData) {
    return <PageLoading />;
  }

  const renderWithLinks = (text: string) => {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      parts.push(
        <a
          key={match.index}
          href={match[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline"
        >
          {match[0]}
        </a>,
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  };

  const contextFields = appData.contextFields ?? [];
  const allScoredFields = [...appData.scoreFields, ...(appData.customScoreFields ?? [])];
  const scoredCount = allScoredFields.filter((f) => scores[f] !== undefined).length;
  const totalScored = allScoredFields.length;
  const gradingLocked = appData.gradingEditLock?.locked ?? false;
  const lockMessage = appData.gradingEditLock?.message ?? '';

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <PageContainer className="py-3 sm:py-3 lg:py-3">
          <PageContent
            width="comfortable"
            className="flex items-center justify-between gap-3"
          >
            <button
              type="button"
              onClick={() => router.push(`/team/${teamId}`)}
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
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {scoredCount}/{totalScored} scored
            </span>
          </PageContent>
        </PageContainer>
      </div>

      <PageContainer className="py-6 sm:py-6 lg:py-6">
        <PageContent width="comfortable" className="space-y-6 pb-8">
          {gradingLocked && <StatusBanner type="info" message={lockMessage} />}

          {appData.graderInstructions && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700">
                Instructions
              </p>
              <p className="whitespace-pre-wrap text-sm text-amber-900">
                {appData.graderInstructions}
              </p>
            </div>
          )}

          {contextFields.length > 0 && (
            <Card className="p-4 sm:p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Application context
              </p>
              <div className="space-y-3">
                {contextFields.map((field) => {
                  const val = appData.fields[field] || '—';
                  const isUrl = val.startsWith('http://') || val.startsWith('https://');
                  return (
                    <div key={field} className="flex min-w-0 gap-3">
                      <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">
                        {field}
                      </span>
                      {isUrl ? (
                        <a
                          href={val}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 break-all text-sm text-primary underline"
                        >
                          {val}
                        </a>
                      ) : (
                        <span className="min-w-0 break-words text-sm">{val}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {appData.scoreFields.map((field) => (
            <Card key={field} className="p-4 sm:p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                {field}
              </p>
              <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">
                {appData.fields[field] ? (
                  renderWithLinks(appData.fields[field])
                ) : (
                  <span className="italic text-muted-foreground">No response</span>
                )}
              </p>
              <div className="border-t border-border/60 pt-4">
                <p className="mb-2 text-sm text-muted-foreground">Score (1–5)</p>
                <ScoreSelector
                  value={scores[field] ?? null}
                  onChange={(n) => setScores((prev) => ({ ...prev, [field]: n }))}
                  disabled={gradingLocked}
                />
              </div>
            </Card>
          ))}

          {(appData.customScoreFields ?? []).map((field) => (
            <Card key={`custom:${field}`} className="p-4 sm:p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
                {field}
              </p>
              <div className="border-t border-border/60 pt-4">
                <p className="mb-2 text-sm text-muted-foreground">Score (1–5)</p>
                <ScoreSelector
                  value={scores[field] ?? null}
                  onChange={(n) => setScores((prev) => ({ ...prev, [field]: n }))}
                  disabled={gradingLocked}
                />
              </div>
            </Card>
          ))}

          <Card className="p-4 sm:p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Comments
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Any comments or flags for this application"
              rows={3}
              disabled={gradingLocked}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </Card>

          {submitError && <StatusBanner message={submitError} type="error" />}

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
