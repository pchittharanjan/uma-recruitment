'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import LoadingButton from '@/components/loading-button';
import StageBadge from '@/components/stage-badge';

interface ApplicationData {
  id: number;
  rowIndex: number;
  fields: Record<string, string>;
  finalScore: number | null;
  rank: number | null;
  assignments: Array<{ graderName: string; total: number | null; status: string }>;
}

interface TeamFinalizeData {
  team: { id: number; name: string };
  dashboard: {
    applications: ApplicationData[];
    csvHeaders: string[];
    scoreFields: string[];
    customScoreFields: string[];
    normalizationFactors: Array<{
      userId: number;
      graderName: string;
      rawMean: number;
      adjustment: number;
    }> | null;
  };
}

export default function TeamFinalizePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const [data, setData] = useState<TeamFinalizeData | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/admin/teams/${teamId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.dashboard || !d.round) {
          router.push(`/admin/teams/${teamId}`);
          return;
        }
        setData({ team: d.team, dashboard: d.dashboard });
      });
  }, [router, teamId]);

  if (!data) {
    return <PageLoading />;
  }

  const ranked = [...data.dashboard.applications]
    .filter((a) => a.rank !== null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const rankCounts: Record<number, number> = {};
  for (const app of ranked) {
    if (app.rank !== null) rankCounts[app.rank] = (rankCounts[app.rank] ?? 0) + 1;
  }

  const contextFields = data.dashboard.csvHeaders.filter(
    (h) => !data.dashboard.scoreFields.includes(h),
  );
  const nameField =
    data.dashboard.csvHeaders.find((h) => h === 'First name') ??
    data.dashboard.csvHeaders.find((h) => h === 'Full name') ??
    data.dashboard.csvHeaders.find((h) => h === 'Email') ??
    contextFields[0];

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow={data.team.name}
        title="Final results"
        description={`${ranked.length} applications ranked`}
        actions={
          <a href={`/api/admin/teams/${teamId}/export`} download>
            <LoadingButton variant="secondary">Export CSV</LoadingButton>
          </a>
        }
      />

      <PageSection>
        {data.dashboard.normalizationFactors && data.dashboard.normalizationFactors.length > 0 && (
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold">Grader calibration applied</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.dashboard.normalizationFactors.map((f) => (
                <div key={f.userId} className="display-field rounded-lg p-3 text-sm">
                  <p className="truncate font-medium">{f.graderName}</p>
                  <p className="text-muted-foreground">Avg: {f.rawMean.toFixed(2)}</p>
                  <p className="font-semibold">
                    {f.adjustment > 0.05
                      ? `+${f.adjustment.toFixed(2)}`
                      : f.adjustment < -0.05
                        ? f.adjustment.toFixed(2)
                        : 'No adjustment'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

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
                <tr className="border-b bg-muted/40">
                  <th className="p-4 text-left font-medium text-muted-foreground">Rank</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Applicant</th>
                  <th className="p-4 text-left font-medium text-muted-foreground">Graders</th>
                  <th className="p-4 text-right font-medium text-muted-foreground">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {ranked.map((app) => {
                  const isTied = app.rank !== null && (rankCounts[app.rank] ?? 0) > 1;
                  return (
                    <tr
                      key={app.id}
                      className={isTied ? 'cursor-pointer bg-yellow-50/60 hover:bg-yellow-50' : 'hover:bg-muted/30'}
                      onClick={isTied ? () => setExpandedId(expandedId === app.id ? null : app.id) : undefined}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                            {app.rank}
                          </span>
                          {isTied && <StageBadge label="TIE" color="orange" />}
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-medium">
                          {nameField
                            ? app.fields[nameField]
                            : `Application #${app.rowIndex}`}
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {app.assignments.map((a, i) => (
                            <StageBadge
                              key={i}
                              label={`${a.graderName}: ${a.total ?? '–'}`}
                              color={a.status === 'completed' ? 'green' : 'yellow'}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right font-bold text-primary">
                        {app.finalScore !== null ? app.finalScore.toFixed(2) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
