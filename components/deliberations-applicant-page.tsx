'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import {
  DeliberationsReviewsSection,
  DeliberationsPhaseScoreChips,
  type DeliberationsPhaseScoreKey,
} from '@/components/deliberations-candidate-detail';
import StageBadge from '@/components/stage-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer, PageContent, PageHeader } from '@/components/page-shell';
import { displayApplicantId } from '@/lib/applicant-id';
import { cachedJsonFetch } from '@/lib/client-fetch-cache';
import type {
  DeliberationsCandidateDetail,
  DeliberationsCoffeeChat,
} from '@/lib/deliberations-types';
import {
  deliberationsBoardHref,
  type DeliberationsAudience,
} from '@/lib/deliberations-paths';
import type { ApplicationStage } from '@/lib/db';
import { applicationStageLabel } from '@/lib/stages';
import { cn } from '@/lib/utils';

function stageBadgeColor(stage: string): 'blue' | 'green' | 'gray' | 'yellow' | 'orange' {
  switch (stage as ApplicationStage) {
    case 'advanced':
      return 'green';
    case 'rejected':
      return 'orange';
    case 'application':
      return 'blue';
    case 'first_round':
    case 'final_round':
      return 'yellow';
    default:
      return 'gray';
  }
}

function NoteBlock({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{value}</p>
    </div>
  );
}

function CoffeeChatCard({ chat }: { chat: DeliberationsCoffeeChat }) {
  return (
    <div className="display-panel space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{chat.submitterName}</p>
          <p className="text-sm text-foreground/70">{chat.chatDate}</p>
        </div>
        {chat.teamsInterested.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Teams: {chat.teamsInterested.join(', ')}
          </p>
        ) : null}
      </div>
      {chat.applicantGradeLevel ? (
        <p className="text-xs text-muted-foreground">Grade: {chat.applicantGradeLevel}</p>
      ) : null}
      <div className="space-y-2">
        <NoteBlock label="Vibes" value={chat.vibes} />
        <NoteBlock label="Green flags" value={chat.greenFlags} />
        <NoteBlock label="Red flags" value={chat.redFlags} />
        <NoteBlock label="Other comments" value={chat.otherComments} />
        <NoteBlock label="Conflict of interest" value={chat.conflictOfInterest} />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm italic text-muted-foreground">{message}</p>;
}

export function DeliberationsApplicantPage({
  teamId,
  teamName: teamNameProp,
  applicationId,
  audience,
  detailUrl,
}: {
  teamId: number;
  teamName?: string;
  applicationId: number;
  audience: DeliberationsAudience;
  detailUrl: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<DeliberationsCandidateDetail | null>(null);
  const [teamName, setTeamName] = useState(teamNameProp ?? '');
  const [activeTab, setActiveTab] = useState('application');

  function handleSelectPhase(phase: DeliberationsPhaseScoreKey) {
    if (phase === 'application') setActiveTab('app-scores');
    else if (phase === 'firstRound') setActiveTab('first');
    else setActiveTab('final');
  }

  useEffect(() => {
    if (teamNameProp) setTeamName(teamNameProp);
  }, [teamNameProp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    cachedJsonFetch<{
      detail?: DeliberationsCandidateDetail;
      team?: { name?: string };
      error?: string;
    }>(detailUrl)
      .then(({ ok, json }) => {
        if (cancelled || !json) return;
        if (!ok || !json.detail) {
          setError(json.error ?? 'Failed to load applicant.');
          return;
        }
        setDetail(json.detail);
        if (json.team?.name) setTeamName(json.team.name);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load applicant.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailUrl]);

  const boardHref = deliberationsBoardHref(teamId, audience);
  const scoreFieldLabels = detail?.scoreFieldLabels ?? {};

  return (
    <PageContainer size="wide" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={boardHref} />}
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to board
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : detail ? (
        <>
          <PageHeader
            title={detail.name}
            description={[
              `Row ${displayApplicantId(detail.rowIndex)}`,
              detail.email?.trim() || null,
              teamName || null,
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              <StageBadge
                label={applicationStageLabel(detail.stage as ApplicationStage)}
                color={stageBadgeColor(detail.stage)}
                size="compact"
              />
            }
          />

          <PageContent width="wide" className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                Phase scores
              </p>
              <DeliberationsPhaseScoreChips
                application={detail.phaseAverages.application}
                firstRound={detail.phaseAverages.firstRound}
                finalRound={detail.phaseAverages.finalRound}
                onSelectPhase={handleSelectPhase}
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
              <TabsList variant="line" className="h-auto w-full justify-start gap-1">
                <TabsTrigger value="application">Application</TabsTrigger>
                <TabsTrigger value="coffee">
                  Coffee chats
                  {(detail.coffeeChats ?? []).length > 0
                    ? ` (${detail.coffeeChats.length})`
                    : ''}
                </TabsTrigger>
                <TabsTrigger value="app-scores">
                  App scores
                  {detail.applicationReviews.length > 0
                    ? ` (${detail.applicationReviews.length})`
                    : ''}
                </TabsTrigger>
                <TabsTrigger value="first">
                  First round
                  {detail.firstRoundReviews.length > 0
                    ? ` (${detail.firstRoundReviews.length})`
                    : ''}
                </TabsTrigger>
                <TabsTrigger value="final">
                  Final round
                  {detail.finalRoundReviews.length > 0
                    ? ` (${detail.finalRoundReviews.length})`
                    : ''}
                </TabsTrigger>
                <TabsTrigger value="notes">Flags & notes</TabsTrigger>
              </TabsList>

              <TabsContent value="application" className="space-y-3">
                {Object.keys(detail.fields).length > 0 ? (
                  <ApplicationFieldsList fields={detail.fields} />
                ) : (
                  <EmptyState message="No application fields." />
                )}
              </TabsContent>

              <TabsContent value="coffee" className="space-y-3">
                {(detail.coffeeChats ?? []).length === 0 ? (
                  <EmptyState message="No coffee chats matched to this applicant." />
                ) : (
                  (detail.coffeeChats ?? []).map((chat) => (
                    <CoffeeChatCard key={chat.id} chat={chat} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="app-scores">
                <DeliberationsReviewsSection
                  title="Application scores"
                  reviews={detail.applicationReviews}
                  scoreFieldLabels={scoreFieldLabels}
                />
              </TabsContent>

              <TabsContent value="first">
                <DeliberationsReviewsSection
                  title="First round interviews"
                  reviews={detail.firstRoundReviews}
                  scoreFieldLabels={scoreFieldLabels}
                />
              </TabsContent>

              <TabsContent value="final">
                <DeliberationsReviewsSection
                  title="Final round interviews"
                  reviews={detail.finalRoundReviews}
                  scoreFieldLabels={scoreFieldLabels}
                />
              </TabsContent>

              <TabsContent value="notes" className="space-y-4">
                {detail.adminNote?.trim() ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      Admin note
                    </p>
                    <p className="display-field whitespace-pre-wrap text-base text-foreground">
                      {detail.adminNote}
                    </p>
                  </div>
                ) : (
                  <EmptyState message="No admin note." />
                )}

                {detail.flags.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      Flags
                    </p>
                    {detail.flags.map((flag, index) => (
                      <div
                        key={`${flag.authorName}-${index}`}
                        className={cn(
                          'rounded-md border px-3 py-2',
                          flag.color === 'red'
                            ? 'border-red-300 bg-red-50 text-red-950'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-950',
                        )}
                      >
                        <p className="text-sm font-medium">
                          {flag.color === 'red' ? 'Red' : 'Green'} · {flag.authorName}
                        </p>
                        {flag.note?.trim() ? (
                          <p className="mt-1 whitespace-pre-wrap text-base">{flag.note}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No flags." />
                )}
              </TabsContent>
            </Tabs>
          </PageContent>
        </>
      ) : null}
    </PageContainer>
  );
}
