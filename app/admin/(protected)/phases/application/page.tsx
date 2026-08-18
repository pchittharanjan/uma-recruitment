'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon } from 'lucide-react';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { phasePageEyebrow, type UnlockableStage } from '@/lib/stages';
import type { RoundStatus } from '@/lib/db';
import { teamDotClass } from '@/lib/team-colors';
import { cn } from '@/lib/utils';

interface TeamRound {
  id: number;
  label: string;
  status: RoundStatus;
}

interface TeamSummary {
  id: number;
  name: string;
  round: TeamRound | null;
  unlockedStages: UnlockableStage[];
  applicationCount: number;
  assignmentProgress: { total: number; completed: number };
}


function AssignmentProgressCell({
  total,
  completed,
}: {
  total: number;
  completed: number;
}) {
  const pending = total - completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const done = total > 0 && pending === 0;

  return (
    <div className="flex min-w-[10rem] max-w-xs flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            done ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
          )}
        >
          {total === 0 ? 'No assignments' : done ? 'All graded' : `${pending} left`}
        </span>
        {total > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {completed}/{total}
          </span>
        )}
      </div>
      {total > 0 && (
        <Progress
          value={pct}
          max={100}
          className={cn(
            'w-full gap-0 [&_[data-slot=progress-track]]:h-1.5',
            done && '[&_[data-slot=progress-indicator]]:bg-emerald-600',
          )}
        />
      )}
    </div>
  );
}

export default function ApplicationPhasePage() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [graderUnlocked, setGraderUnlocked] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/admin/dashboard'), fetch('/api/admin/phase?light=1')])
      .then(async ([dashboardRes, phaseRes]) => {
        if (dashboardRes.status === 401) {
          router.push('/login');
          return;
        }
        const dashboardJson = await dashboardRes.json();
        const phaseJson = phaseRes.ok ? await phaseRes.json() : null;
        if (dashboardJson.error) {
          setError(dashboardJson.error);
          return;
        }
        setTeams(dashboardJson.teams ?? []);
        setGraderUnlocked(phaseJson?.unlockedStages?.includes('application') ?? false);
      })
      .catch(() => setError('Failed to load application progress.'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <PageLoading />;
  const hasAnyApplications = teams.some((team) => team.applicationCount > 0);

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow={phasePageEyebrow('application')}
        title="Grading Progress"
        actions={
          hasAnyApplications ? (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/applications" />}
            >
              All applications
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/import" />}
            >
              Upload CSV
            </Button>
          )
        }
      />

      {error && <StatusBanner type="error" message={error} />}

      <StatusBanner
        type="info"
        message="Design teams: classify link columns (Google Drive, Figma, portfolio) as portfolio fields at import so graders can review work during application grading without seeing names or email."
      />

      {!graderUnlocked && (
        <StatusBanner
          type="info"
          message="Application grading is locked for graders. Unlock it from the dashboard when you're ready."
          actionLabel="Click to unlock each phase"
          actionHref="/admin/dashboard#pipeline-controls"
        />
      )}

      <PageSection>
        <div className="display-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-background hover:bg-background">
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Team
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Applicants
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Grading Progress
                </TableHead>
                <TableHead className="h-11 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {' '}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => {
                const hasRound = team.round !== null;
                const { total, completed } = team.assignmentProgress;

                return (
                  <TableRow
                    key={team.id}
                    className="group border-border transition-colors last:border-0"
                  >
                    <TableCell className="px-4 py-4 whitespace-normal">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'size-2.5 shrink-0 rounded-full ring-2 ring-background',
                            teamDotClass(team.name),
                          )}
                          aria-hidden
                        />
                        <p className="font-medium text-foreground">{team.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      {!hasRound ? (
                        <span className="text-sm text-muted-foreground">-</span>
                      ) : (
                        <span className="text-sm tabular-nums">{team.applicationCount}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-4 whitespace-normal">
                      {!hasRound ? (
                        <span className="text-sm text-muted-foreground">Import CSV to Start</span>
                      ) : (
                        <AssignmentProgressCell total={total} completed={completed} />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {hasRound ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <Link href={`/admin/applications?teamId=${team.id}`} />
                              }
                            >
                              Applications
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary"
                              nativeButton={false}
                              render={<Link href={`/admin/teams/${team.id}`} />}
                            >
                              Open team
                              <ArrowRightIcon
                                data-icon="inline-end"
                                className="transition-transform group-hover:translate-x-0.5"
                              />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link href="/admin/import" />}
                          >
                            Import
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PageSection>
    </PageContainer>
  );
}
