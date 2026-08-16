'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { AdvancementActivityLog } from '@/components/advancement-activity-log';
import { AdminAdvancementReadinessOverview } from '@/components/admin-advancement-readiness-overview';
import { TeamAdvancementCapSettings } from '@/components/team-advancement-cap-settings';
import { advancementFromStageLabel } from '@/lib/advancement-submissions-types';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AvgScoreCell, AvgScoreHeader } from '@/components/avg-score-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Submission {
  id: number;
  teamId: number;
  teamName: string;
  roundLabel: string;
  fromStage: AdvancementFromStage;
  topN: number;
  status: string;
  submittedAt: number;
  submittedBy: { name: string; email: string };
  candidates: Array<{
    applicationId: number;
    rowIndex: number;
    candidateName: string;
    average: number;
    rawAverage?: number;
    rank: number;
  }>;
}

interface ActivityEntry {
  id: number;
  teamId: number;
  teamName: string;
  roundLabel: string;
  fromStage: AdvancementFromStage;
  topN: number;
  status: 'submitted' | 'approved' | 'withdrawn';
  submittedAt: number;
  submittedBy: { name: string; email: string };
  reviewedBy: { name: string; email: string } | null;
  reviewedAt: number | null;
  candidates: Array<{
    applicationId: number;
    rowIndex: number;
    candidateName: string;
    average: number;
    rawAverage?: number;
    rank: number;
  }>;
}

interface TeamReadinessRow {
  teamId: number;
  teamName: string;
  fromStage: AdvancementFromStage;
  status: {
    graders: Array<{
      userId: number;
      name: string;
      total: number;
      verdictSet: number;
      pending: number;
    }>;
    summary: {
      totalAssignments: number;
      scoringCompleted: number;
      verdictSet: number;
      applicationsInStage: number;
      totalApplicants: number;
    };
    allVerdictsComplete: boolean;
    submission: {
      status: 'none' | 'submitted' | 'approved' | 'withdrawn';
      submittedBy: string | null;
      topN: number | null;
    };
  };
  outcome: {
    rows: Array<{
      applicationId: number;
      rowIndex: number;
      candidateName: string;
      stage: string;
      outcome: 'advanced' | 'rejected' | 'pending';
      average: number | null;
      rank: number | null;
    }>;
    advancedCount: number;
    rejectedCount: number;
    pendingCount: number;
    canRevert: boolean;
    revertBlockedReason: string | null;
  };
}

export default function AdminAdvancementsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [teamReadiness, setTeamReadiness] = useState<TeamReadinessRow[]>([]);
  const [readinessStage, setReadinessStage] = useState<AdvancementFromStage | null>(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [approveError, setApproveError] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/admin/advancements?includeReadiness=1');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load submissions.');
      return;
    }
    setSubmissions(json.submissions);
    setActivity(json.activity ?? []);
    const readiness = (json.teamReadiness ?? []) as TeamReadinessRow[];
    setTeamReadiness(readiness);
    setReadinessStage(readiness[0]?.fromStage ?? null);
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (submissionId: number, force = false) => {
    setApproveError('');
    setApprovingId(submissionId);
    try {
      const res = await fetch(`/api/admin/advancements/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.includes('still pending') && !force) {
          setConfirmId(submissionId);
          return;
        }
        const message = json.error ?? 'Approval failed.';
        setApproveError(message);
        toast.error(message);
        return;
      }
      setConfirmId(null);
      toast.success('Advancement approved');
      await fetchData();
    } catch {
      setApproveError('Approval failed.');
      toast.error('Approval failed.');
    } finally {
      setApprovingId(null);
    }
  };

  if (error) {
    return (
      <PageContainer>
        <StatusBanner type="error" message={error} />
      </PageContainer>
    );
  }

  if (!submissions || !activity) return <PageLoading />;

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Team advancement submissions"
      />

      {approveError && <StatusBanner type="error" message={approveError} />}

      <PageSection>
        <TeamAdvancementCapSettings />
      </PageSection>

      {teamReadiness.length > 0 && readinessStage && (
        <PageSection>
          <AdminAdvancementReadinessOverview
            teams={teamReadiness}
            fromStage={readinessStage}
            onRefresh={fetchData}
          />
        </PageSection>
      )}

      {activity.length > 0 && (
        <PageSection>
          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-base">Submission log</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <AdvancementActivityLog entries={activity} hideHeader />
            </CardContent>
          </Card>
        </PageSection>
      )}

      <PageSection>
        {submissions.length === 0 ? (
          <Card className="pb-0">
            <CardHeader className="gap-2">
              <CardTitle className="text-base">Pending approvals</CardTitle>
              <CardDescription>
                When a Director submits their advancement list, it will appear here for you to
                review and approve.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No pending submissions right now.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <Card key={sub.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>
                      <Link
                        href={`/admin/teams/${sub.teamId}`}
                        className="hover:underline"
                      >
                        {sub.teamName}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {advancementFromStageLabel(sub.fromStage)} · {sub.topN} advancing · submitted
                      by {sub.submittedBy.name} on{' '}
                      {new Date(sub.submittedAt * 1000).toLocaleString()}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <LoadingButton
                      variant="secondary"
                      onClick={() =>
                        setExpandedId((id) => (id === sub.id ? null : sub.id))
                      }
                    >
                      {expandedId === sub.id ? 'Hide list' : 'View list'}
                    </LoadingButton>
                    <LoadingButton
                      loading={approvingId === sub.id}
                      onClick={() => handleApprove(sub.id)}
                    >
                      Approve & advance
                    </LoadingButton>
                  </div>
                </CardHeader>
                {expandedId === sub.id && (
                  <CardContent>
                    <Table className="w-full table-fixed">
                      <colgroup>
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '56%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>#</TableHead>
                          <TableHead>Name</TableHead>
                          <AvgScoreHeader
                            align="right"
                            variant={
                              sub.fromStage === 'first_round' ? 'interview' : 'application'
                            }
                          />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sub.candidates.map((c) => (
                          <TableRow key={c.applicationId}>
                            <TableCell>{c.rank}</TableCell>
                            <TableCell>{c.rowIndex}</TableCell>
                            <TableCell>{c.candidateName}</TableCell>
                            <TableCell className="text-right">
                              <AvgScoreCell
                                average={c.average}
                                rawAverage={
                                  sub.fromStage === 'first_round' ? undefined : c.rawAverage
                                }
                                align="right"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </PageSection>

      <DestructiveConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Incomplete grading"
        description="Some interview assignments are still pending. Approve anyway and apply this advancement list?"
        confirmLabel="Approve anyway"
        onConfirm={async () => {
          if (confirmId !== null) await handleApprove(confirmId, true);
        }}
      />
    </PageContainer>
  );
}
