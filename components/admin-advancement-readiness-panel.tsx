'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StageBadge from '@/components/stage-badge';
import { advancementFromStageLabel } from '@/lib/advancement-submissions-types';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface GraderVerdictProgress {
  userId: number;
  name: string;
  email: string;
  total: number;
  verdictSet: number;
  pending: number;
  green: number;
  highYellow: number;
  yellow: number;
  lowYellow: number;
  red: number;
}

interface AdvancementStatusData {
  fromStage: AdvancementFromStage;
  graders: GraderVerdictProgress[];
  allVerdictsComplete: boolean;
  submission: {
    status: 'none' | 'submitted' | 'approved' | 'withdrawn';
    submittedAt: number | null;
    submittedBy: string | null;
    topN: number | null;
    reviewedAt: number | null;
  };
}

function submissionBadge(status: AdvancementStatusData['submission']['status']) {
  switch (status) {
    case 'submitted':
      return <StageBadge label="Pending admin review" color="yellow" />;
    case 'approved':
      return <StageBadge label="Approved" color="green" />;
    case 'withdrawn':
      return <StageBadge label="Withdrawn" color="gray" />;
    default:
      return <StageBadge label="Not submitted" color="gray" />;
  }
}

export function AdminAdvancementReadinessPanel({
  teamId,
  fromStage,
  compact = false,
}: {
  teamId: string | number;
  fromStage: AdvancementFromStage;
  compact?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<AdvancementStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/teams/${teamId}/advancement-status?fromStage=${fromStage}`,
        { cache: 'no-store' },
      );
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load advancement status.');
        return;
      }
      setData(json.status as AdvancementStatusData);
    } catch {
      setError('Failed to load advancement status.');
    } finally {
      setLoading(false);
    }
  }, [fromStage, router, teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardHeader className={cn(compact && 'pb-3')}>
          <CardTitle className={cn(compact && 'text-base')}>
            {fromStage === 'application' ? 'Color signals' : 'Interview signals'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" role="status" aria-label="Loading">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!data) return null;

  const pendingGraders = data.graders.filter((g) => g.pending > 0);
  const stageLabel = advancementFromStageLabel(fromStage);
  const showBreakdown = data.graders.some((g) => g.verdictSet > 0);

  return (
    <Card>
      <CardHeader className={cn(compact && 'pb-3')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className={cn(compact && 'text-base')}>
              {fromStage === 'application' ? 'Color signals' : 'Interview signals'}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {submissionBadge(data.submission.status)}
            {!data.allVerdictsComplete && data.graders.length > 0 && (
              <StageBadge
                label={`${pendingGraders.length} grader${pendingGraders.length === 1 ? '' : 's'} pending`}
                color="orange"
              />
            )}
            {data.allVerdictsComplete && data.graders.length > 0 && (
              <StageBadge label="All verdicts in" color="green" />
            )}
          </div>
        </div>
        {data.submission.status === 'submitted' && data.submission.submittedBy && (
          <p className="text-sm text-muted-foreground">
            Submitted by {data.submission.submittedBy}
            {data.submission.submittedAt
              ? ` on ${new Date(data.submission.submittedAt * 1000).toLocaleString()}`
              : ''}
            {data.submission.topN ? ` · ${data.submission.topN} advancing` : ''}
          </p>
        )}
        {data.submission.status === 'approved' && data.submission.reviewedAt && (
          <p className="text-sm text-muted-foreground">
            Approved{' '}
            {new Date(data.submission.reviewedAt * 1000).toLocaleString()}
            {data.submission.topN ? ` · ${data.submission.topN} advanced` : ''}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {data.graders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No grader assignments yet for this stage.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-muted/35">
            <Table className="table-fixed">
              <colgroup>
                <col style={{ width: showBreakdown ? '36%' : '50%' }} />
                <col style={{ width: showBreakdown ? '28%' : '50%' }} />
                {showBreakdown ? <col style={{ width: '36%' }} /> : null}
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                    Grader
                  </TableHead>
                  <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                    Signals
                  </TableHead>
                  {showBreakdown && (
                    <TableHead className="text-right text-xs font-medium tracking-wide text-muted-foreground">
                      Breakdown
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.graders.map((g) => {
                  const done = g.pending === 0 && g.total > 0;
                  return (
                    <TableRow key={g.userId}>
                      <TableCell>
                        <p className="font-medium">{g.name}</p>
                        {!compact && (
                          <p className="text-xs text-muted-foreground">{g.email}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            done ? 'text-emerald-700' : 'text-foreground',
                          )}
                        >
                          {g.total === 0
                            ? 'No assignments'
                            : `${g.verdictSet}/${g.total} set · ${g.pending} left`}
                        </span>
                      </TableCell>
                      {showBreakdown && (
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {g.verdictSet === 0 ? (
                            '—'
                          ) : (
                            <>
                              <span className="text-green-700">{g.green} green</span>
                              {' · '}
                              <span className="text-amber-700">{g.yellow + g.highYellow + g.lowYellow} yellow</span>
                              {' · '}
                              <span className="text-red-700">{g.red} red</span>
                            </>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
