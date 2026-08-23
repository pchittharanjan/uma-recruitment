'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon, CheckIcon, MailIcon } from 'lucide-react';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  communicationsHref,
  outcomeEmailPhaseEyebrow,
  outcomeEmailTargetLabel,
  parseOutcomeEmailStage,
  type OutcomeEmailStage,
} from '@/lib/communications-stages';

interface TeamRow {
  team: { id: number; name: string };
  round: { id: number; label: string };
  fromStage: OutcomeEmailStage;
  passCount: number;
  rejectCount: number;
  passNotifiedAt: number | null;
  rejectNotifiedAt: number | null;
  complete: boolean;
}

function SentBadge({ sent, count }: { sent: boolean; count: number }) {
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  if (sent) {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
        <CheckIcon className="size-3" />
        Sent
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 text-amber-800">
      <MailIcon className="size-3" />
      Pending
    </Badge>
  );
}

export default function AdminCommunicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam =
    searchParams.get('fromStage') ?? searchParams.get('view');
  const requestedStage = stageParam ? parseOutcomeEmailStage(stageParam) : null;

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [completeCount, setCompleteCount] = useState(0);
  const [resolvedStage, setResolvedStage] = useState<OutcomeEmailStage>(
    requestedStage ?? 'application',
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = requestedStage ? `?fromStage=${requestedStage}` : '';
    const res = await fetch(`/api/admin/communications${qs}`);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load communications.');
      return;
    }
    setTeams(json.teams ?? []);
    setCompleteCount(json.completeCount ?? 0);
    setResolvedStage(
      parseOutcomeEmailStage(json.fromStage, requestedStage ?? 'application'),
    );
  }, [requestedStage, router]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <PageLoading />;

  const targetLabel = outcomeEmailTargetLabel(resolvedStage);

  return (
    <PageContainer>
      <PageSection>
      <PageHeader
        eyebrow={outcomeEmailPhaseEyebrow(resolvedStage)}
        title="Applicant Outcome Emails"
      />

      {error && <StatusBanner type="error" message={error} />}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {teams.length === 0
              ? 'No active rounds yet.'
              : `${completeCount}/${teams.length} teams fully notified · Advancing to ${targetLabel}`}
          </p>
        </div>

        <div className="display-panel overflow-hidden" data-tour="comms-audience">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 bg-background hover:bg-background">
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Team
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Advancing
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Not advancing
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pass emails
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reject emails
                </TableHead>
                <TableHead className="h-11 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {' '}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((row) => (
                <TableRow
                  key={row.team.id}
                  className="border-border last:border-0"
                >
                  <TableCell className="px-4 py-4 font-medium">{row.team.name}</TableCell>
                  <TableCell className="px-4 py-4 tabular-nums text-sm">{row.passCount}</TableCell>
                  <TableCell className="px-4 py-4 tabular-nums text-sm">
                    {row.rejectCount}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <SentBadge sent={row.passNotifiedAt !== null} count={row.passCount} />
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <SentBadge sent={row.rejectNotifiedAt !== null} count={row.rejectCount} />
                  </TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      data-tour="comms-compose"
                      render={
                        <Link href={communicationsHref(resolvedStage, row.team.id)} />
                      }
                    >
                      Compose emails
                      <ArrowRightIcon data-icon="inline-end" className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Import applications and approve advancement lists first.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>
    </PageContainer>
  );
}
