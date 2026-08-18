'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection, TitleCount } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import LoadingButton from '@/components/loading-button';
import StageBadge from '@/components/stage-badge';
import type { InterviewResultsData } from '@/lib/interview-results';
import type { RoundStatus } from '@/lib/db';
import type { InterviewSlotStage } from '@/lib/interview-slots';
import { CenteredMessage } from '@/components/centered-message';
import { MicIcon } from 'lucide-react';

interface InterviewResultsResponse {
  team: { id: number; name: string };
  round: { id: number; label: string; status: RoundStatus };
  results: InterviewResultsData;
}

function resultsTitle(stage: InterviewSlotStage): string {
  if (stage === 'first_round') return 'First Round Results';
  if (stage === 'final_round') return 'Final Round Results';
  return 'Interview Results';
}

export default function TeamInterviewResultsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam = searchParams.get('stage');
  const stage: InterviewSlotStage =
    stageParam === 'final_round' ? 'final_round' : 'first_round';
  const [data, setData] = useState<InterviewResultsResponse | null>(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setError('');
    fetch(`/api/admin/teams/${teamId}/interview-results?stage=${stage}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) {
          router.push('/login');
          return null;
        }
        const json = await r.json();
        if (!r.ok) {
          setError(json.error ?? 'Failed to load interview results.');
          return null;
        }
        return json as InterviewResultsResponse;
      })
      .then((json) => {
        if (json) setData(json);
      })
      .catch(() => setError('Failed to load interview results.'));
  }, [router, stage, teamId]);

  if (!data && !error) {
    return <PageLoading />;
  }

  if (error && !data) {
    return (
      <PageContainer>
        <StatusBanner type="error" message={error} />
      </PageContainer>
    );
  }

  if (!data) return <PageLoading />;

  const { results } = data;
  const ranked = results.candidates.filter((candidate) => candidate.rank !== null);
  const unranked = results.candidates.filter((candidate) => candidate.rank === null);

  if (results.candidates.length === 0) {
    return (
      <PageContainer className="space-y-6">
        <PageHeader eyebrow={data.team.name} title={resultsTitle(stage)} />
        <CenteredMessage
          icon={MicIcon}
          title="No candidates in this phase yet"
          description="Advance applicants from the previous phase, or set up the interview schedule while you wait."
          ctaLabel="Open Schedule"
          ctaHref={
            stage === 'final_round'
              ? `/admin/teams/${teamId}/schedule/final-round`
              : `/admin/teams/${teamId}/schedule/first-round`
          }
        />
      </PageContainer>
    );
  }

  const rankCounts: Record<number, number> = {};
  for (const candidate of ranked) {
    if (candidate.rank !== null) {
      rankCounts[candidate.rank] = (rankCounts[candidate.rank] ?? 0) + 1;
    }
  }

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow={data.team.name}
        title={resultsTitle(stage)}
        description={`${ranked.length} ranked · ${results.progress.completed} of ${results.progress.total} interview scores submitted`}
        actions={
          <a href={`/api/admin/teams/${teamId}/interview-results/export?stage=${stage}`} download>
            <LoadingButton variant="secondary">Export CSV</LoadingButton>
          </a>
        }
      />

      <PageSection className="space-y-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-sm">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '48%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="p-4 text-left font-medium text-muted-foreground">Rank</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Applicant</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Interviewers</th>
                  <th className="p-4 text-right font-medium text-muted-foreground">Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {ranked.map((candidate) => {
                  const isTied =
                    candidate.rank !== null && (rankCounts[candidate.rank] ?? 0) > 1;
                  const isExpanded = expandedId === candidate.applicationId;
                  return (
                    <tr
                      key={candidate.applicationId}
                      className={
                        isTied
                          ? 'cursor-pointer bg-yellow-50/60 hover:bg-yellow-50'
                          : 'uma-hover-on-row'
                      }
                      onClick={
                        isTied
                          ? () =>
                              setExpandedId(
                                isExpanded ? null : candidate.applicationId,
                              )
                          : undefined
                      }
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                            {candidate.rank}
                          </span>
                          {isTied && <StageBadge label="TIE" color="orange" />}
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-medium">{candidate.candidateName}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {candidate.assignments.map((assignment) => (
                            <StageBadge
                              key={assignment.assignmentId}
                              label={`${assignment.interviewerName}: ${assignment.total ?? '–'}`}
                              color={assignment.status === 'completed' ? 'green' : 'yellow'}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right font-bold text-primary">
                        {candidate.average !== null ? candidate.average.toFixed(2) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {unranked.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted px-4 py-3">
              <p className="flex items-baseline gap-2.5 text-sm font-medium text-muted-foreground">
                Awaiting scores
                <TitleCount>{unranked.length}</TitleCount>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <tbody className="divide-y divide-border/60">
                  {unranked.map((candidate) => (
                    <tr key={candidate.applicationId} className="uma-hover-on-row">
                      <td className="p-4 text-muted-foreground">–</td>
                      <td className="p-4">
                        <p className="font-medium">{candidate.candidateName}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {candidate.assignments.length > 0 ? (
                            candidate.assignments.map((assignment) => (
                              <StageBadge
                                key={assignment.assignmentId}
                                label={`${assignment.interviewerName}: ${assignment.total ?? '–'}`}
                                color={assignment.status === 'completed' ? 'green' : 'yellow'}
                              />
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No interviewers assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right text-muted-foreground">–</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </PageSection>
    </PageContainer>
  );
}
