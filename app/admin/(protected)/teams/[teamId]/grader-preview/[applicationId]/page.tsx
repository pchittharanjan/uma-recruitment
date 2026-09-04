'use client';

import React, { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageContent } from '@/components/page-shell';
import { ResponseText } from '@/components/response-text';
import { Card } from '@/components/ui/card';
import LoadingButton from '@/components/loading-button';
import ScoreSelector from '@/components/ScoreSelector';
import StatusBanner from '@/components/status-banner';
import { RequiredAsterisk } from '@/components/ui/label';
import { applicantDisplayId } from '@/lib/blind';

interface PreviewData {
  applicationId: number;
  rowIndex: number;
  fields: Record<string, string>;
  scoreFields: string[];
  contextFields: string[];
  customScoreFields: string[];
  graderInstructions: string | null;
}

export default function AdminGraderPreviewPage({
  params,
}: {
  params: Promise<{ teamId: string; applicationId: string }>;
}) {
  const { teamId, applicationId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/teams/${teamId}/grader-preview/${applicationId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          return;
        }
        setData(json);
      })
      .catch(() => setError('Failed to load preview.'));
  }, [teamId, applicationId]);

  if (error) {
    return (
      <PageContainer className="py-8">
        <StatusBanner message={error} type="error" />
        <LoadingButton className="mt-4" variant="secondary" onClick={() => router.back()}>
          ← Back
        </LoadingButton>
      </PageContainer>
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  const renderWithLinks = (text: string) => <ResponseText text={text} />;

  return (
    <div className="pb-8">
      <div
        className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50"
        data-tour="grade-form-nav"
      >
        <PageContainer className="py-3 sm:py-3 lg:py-3">
          <PageContent
            width="comfortable"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">Grader preview (read-only)</p>
              <p className="text-sm text-amber-800">
                What a grader sees: names and identifying fields are stripped.
              </p>
            </div>
            <LoadingButton
              variant="secondary"
              className="shrink-0"
              onClick={() => router.push(`/admin/teams/${teamId}`)}
            >
              ← Back to team
            </LoadingButton>
          </PageContent>
        </PageContainer>
      </div>

      <PageContainer className="py-6 sm:py-6 lg:py-6">
        <PageContent width="comfortable" className="uma-stack-page">
          <div className="text-center">
            <span className="text-sm font-medium">{applicantDisplayId(data.rowIndex)}</span>
          </div>

          {data.graderInstructions && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 uma-section-label text-amber-700">
                Instructions
              </p>
              <p className="whitespace-pre-wrap text-sm text-amber-900">{data.graderInstructions}</p>
            </div>
          )}

          {data.contextFields.length > 0 && (
            <Card className="p-4 sm:p-5">
              <p className="mb-3 uma-section-label">
                Application context
              </p>
              <div className="space-y-3">
                {data.contextFields.map((field) => {
                  const val = data.fields[field] || '-';
                  return (
                    <div key={field} className="flex min-w-0 gap-3">
                      <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">
                        {field}
                      </span>
                      <span className="min-w-0 break-words text-sm">{val}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="uma-stack-section" data-tour="grade-form-scores">
            {data.scoreFields.map((field) => (
              <Card key={field} className="p-4 sm:p-5 opacity-90">
                <p className="mb-2 uma-section-label text-primary">
                  {field}
                  <RequiredAsterisk className="ml-0.5" />
                </p>
                <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {data.fields[field] ? (
                    renderWithLinks(data.fields[field])
                  ) : (
                    <span className="italic text-muted-foreground">No response</span>
                  )}
                </p>
                <div className="pt-4">
                  <p className="mb-2 text-sm text-muted-foreground">
                    Score (1–5)
                    <RequiredAsterisk className="ml-0.5" />
                  </p>
                  <ScoreSelector value={null} onChange={() => {}} disabled />
                </div>
              </Card>
            ))}

            {data.customScoreFields.map((field) => (
              <Card key={`custom:${field}`} className="p-4 sm:p-5 opacity-90">
                <p className="mb-4 uma-section-label text-primary">
                  {field}
                  <RequiredAsterisk className="ml-0.5" />
                </p>
                <div className="pt-4">
                  <p className="mb-2 text-sm text-muted-foreground">
                    Score (1–5)
                    <RequiredAsterisk className="ml-0.5" />
                  </p>
                  <ScoreSelector value={null} onChange={() => {}} disabled />
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-4 sm:p-5">
            <p className="mb-2 uma-section-label">
              Comments
            </p>
            <textarea
              disabled
              placeholder="Any comments or flags for this application"
              rows={3}
              className="field-textarea text-muted-foreground"
            />
          </Card>
        </PageContent>
      </PageContainer>
    </div>
  );
}
