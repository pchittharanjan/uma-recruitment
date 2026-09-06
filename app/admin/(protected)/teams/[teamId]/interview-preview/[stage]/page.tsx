'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageContent, pagePaddingX } from '@/components/page-shell';
import { cn } from '@/lib/utils';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { InterviewScoringPreview } from '@/components/interview-scoring-preview';
import type { InterviewGuide, InterviewGuideStage } from '@/lib/interview-guide';
import { applyTeamInterviewGuideDefaults } from '@/lib/interview-guide';
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
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isInterviewGuideStage(stageRaw)) {
      setHydrated(true);
      return;
    }
    // Team name may not be known yet; re-read with merge once data loads.
    const staged = readInterviewPreviewGuide(teamId, stageRaw);
    setDraftGuide(staged);
    setHydrated(true);
  }, [teamId, stageRaw]);

  useEffect(() => {
    if (!data?.team.name || !isInterviewGuideStage(stageRaw)) return;
    // Re-merge / upgrade any stashed draft now that we know the team.
    const staged = readInterviewPreviewGuide(teamId, stageRaw, data.team.name);
    if (staged) setDraftGuide(staged);
  }, [data?.team.name, teamId, stageRaw]);

  useEffect(() => {
    let cancelled = false;

    if (!isInterviewGuideStage(stageRaw)) {
      setError('Invalid interview stage.');
      return;
    }

    cachedJsonFetch<PreviewPageData & { error?: string }>(
      `/api/admin/teams/${teamId}/interview-preview/${stageRaw}`,
      { force: true },
    )
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || json?.error) {
          setError(json?.error ?? 'Failed to load preview.');
          return;
        }
        setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load preview.');
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, stageRaw]);

  const guide = useMemo(() => {
    const raw = draftGuide ?? data?.guide ?? null;
    if (!raw || !data?.team.name || !isInterviewGuideStage(stageRaw)) return raw;
    // Re-merge defaults so stashed/localStorage previews pick up rubric upgrades
    // (e.g. Strategy final case categories) instead of freezing an old draft.
    return (
      applyTeamInterviewGuideDefaults(data.team.name, {
        first_round: stageRaw === 'first_round' ? raw : null,
        final_round: stageRaw === 'final_round' ? raw : null,
      })[stageRaw] ?? raw
    );
  }, [draftGuide, data?.guide, data?.team.name, stageRaw]);

  const showGroupSample = stageRaw === 'first_round';

  if (!data && !draftGuide && !hydrated) {
    return <PageLoading />;
  }

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

  const fillHeight = Boolean(guide.casePdfUrl);

  return (
    <div className="flex flex-col has-[[data-interview-workspace]]:h-0 has-[[data-interview-workspace]]:min-h-0 has-[[data-interview-workspace]]:flex-1">
      <div
        data-interview-page-chrome=""
        className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-3.5 backdrop-blur sm:px-8 lg:px-10 xl:px-12 2xl:px-14"
      >
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

      {fillHeight ? (
        <div
          className={cn(
            pagePaddingX,
            'flex flex-col pb-4 pt-3 has-[[data-interview-workspace]]:min-h-0 has-[[data-interview-workspace]]:flex-1',
          )}
          data-interview-fill=""
        >
          <InterviewScoringPreview
            guide={guide}
            stage={stageRaw as InterviewGuideStage}
            teamName={data?.team.name ?? 'Team'}
            showGroupSample={showGroupSample}
            interactive
          />
        </div>
      ) : (
        <PageContainer className="py-6 lg:py-8">
          <PageContent width="wide">
            <InterviewScoringPreview
              guide={guide}
              stage={stageRaw as InterviewGuideStage}
              teamName={data?.team.name ?? 'Team'}
              showGroupSample={showGroupSample}
              interactive
            />
          </PageContent>
        </PageContainer>
      )}
    </div>
  );
}
