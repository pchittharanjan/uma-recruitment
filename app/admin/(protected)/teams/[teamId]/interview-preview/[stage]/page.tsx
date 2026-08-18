'use client';

import { use, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageContent } from '@/components/page-shell';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { InterviewScoringPreview } from '@/components/interview-scoring-preview';
import type { InterviewGuide, InterviewGuideStage } from '@/lib/interview-guide';
import { cachedJsonFetch } from '@/lib/client-fetch-cache';
import {
  clearInterviewPreviewGuide,
  readInterviewPreviewGuide,
} from '@/lib/interview-preview-storage';

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];

function isInterviewGuideStage(value: string): value is InterviewGuideStage {
  return STAGES.includes(value as InterviewGuideStage);
}

interface PreviewPageData {
  team: { id: number; name: string };
  stage: InterviewGuideStage;
  guide: InterviewGuide | null;
}

export default function AdminInterviewPreviewPage({
  params,
}: {
  params: Promise<{ teamId: string; stage: string }>;
}) {
  const { teamId, stage: stageRaw } = use(params);
  const router = useRouter();
  const [data, setData] = useState<PreviewPageData | null>(null);
  const [draftGuide, setDraftGuide] = useState<InterviewGuide | null>(null);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    if (!isInterviewGuideStage(stageRaw)) return;
    const staged = readInterviewPreviewGuide(teamId, stageRaw);
    if (staged) setDraftGuide(staged);
  }, [teamId, stageRaw]);

  useEffect(() => {
    if (!isInterviewGuideStage(stageRaw)) {
      setError('Invalid interview stage.');
      return;
    }

    cachedJsonFetch<PreviewPageData & { error?: string }>(
      `/api/admin/teams/${teamId}/interview-preview/${stageRaw}`,
    )
      .then(({ ok, json }) => {
        if (!ok || json?.error) {
          setError(json?.error ?? 'Failed to load preview.');
          return;
        }
        setData(json);
      })
      .catch(() => setError('Failed to load preview.'));
  }, [teamId, stageRaw]);

  const guide = useMemo(() => draftGuide ?? data?.guide ?? null, [draftGuide, data?.guide]);

  const showGroupSample = stageRaw === 'first_round';

  if (error && !guide) {
    return (
      <PageContainer className="py-8">
        <StatusBanner message={error} type="error" />
        <LoadingButton
          className="mt-4"
          variant="secondary"
          onClick={() => router.push(`/admin/teams/${teamId}/interview-setup`)}
        >
          ← Back to Setup
        </LoadingButton>
      </PageContainer>
    );
  }

  if (!guide) {
    if (!data) {
      return <PageLoading />;
    }
    return (
      <PageContainer className="space-y-4 py-8">
        <StatusBanner
          type="info"
          message="Add at least one question or case prompt in setup, then preview again."
        />
        <LoadingButton
          variant="secondary"
          onClick={() => router.push(`/admin/teams/${teamId}/interview-setup`)}
        >
          ← Back to Setup
        </LoadingButton>
      </PageContainer>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-3.5 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            role="status"
            className="inline-flex items-center rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950 sm:text-sm dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100"
          >
            Preview Mode: Nothing you enter is saved
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2.5"
          onClick={() => {
            clearInterviewPreviewGuide(teamId, stageRaw as InterviewGuideStage);
            router.push(`/admin/teams/${teamId}/interview-setup`);
          }}
        >
          ← Back to Setup
        </Button>
      </div>

      <PageContainer className="!px-5 !py-6 sm:!px-6 lg:!px-8 lg:!py-8">
        <PageContent width={guide.casePdfUrl ? 'fluid' : 'wide'}>
          <InterviewScoringPreview
            guide={guide}
            stage={stageRaw as InterviewGuideStage}
            teamName={data?.team.name ?? 'Team'}
            showGroupSample={showGroupSample}
            interactive
          />
        </PageContent>
      </PageContainer>
    </div>
  );
}
