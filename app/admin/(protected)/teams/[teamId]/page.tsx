'use client';

import { Fragment, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { NavLinkButton } from '@/components/nav-link-button';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { AdminAdvancementReadinessPanel } from '@/components/admin-advancement-readiness-panel';
import { AdminInterviewProgressDetail } from '@/components/admin-interview-progress-detail';
import { TeamGradingSetup } from '@/components/team-grading-setup';
import { TeamStageControls } from '@/components/team-stage-controls';
import { TeamTestAsExecPanel } from '@/components/team-test-as-exec-panel';
import { phaseLabel, parseAdminPhaseSlug } from '@/lib/stages';
import type { RoundStatus } from '@/lib/db';
import { openTeamDeliberationsHref } from '@/lib/deliberations-workspace';
import { communicationsHref, outcomeEmailStageFromPipeline } from '@/lib/communications-stages';
import type { TeamInterviewRoundStats } from '@/lib/interview-slots';
import { isAdminPhasePreview } from '@/lib/admin-phase-preview';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, TitleCount } from '@/components/page-shell';
import { CenteredMessage } from '@/components/centered-message';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { cachedJsonFetch, peekCachedJson, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { UploadIcon } from 'lucide-react';

interface GraderProgress {
  id: number;
  name: string;
  email: string;
  total: number;
  completed: number;
}

interface AssignmentData {
  assignmentId: number;
  userId: number;
  graderName: string;
  status: string;
  scores: Record<string, number>;
  total: number | null;
  comment: string | null;
}

interface ApplicationData {
  id: number;
  rowIndex: number;
  fields: Record<string, string>;
  adminNote: string | null;
  finalScore: number | null;
  rank: number | null;
  assignments: AssignmentData[];
  average: number | null;
}

interface TeamDashboardResponse {
  team: { id: number; name: string };
  round: { id: number; label: string; status: RoundStatus } | null;
  interviewStats?: TeamInterviewRoundStats | null;
  dashboard: {
    progress: { total: number; completed: number };
    graders: GraderProgress[];
    applications: ApplicationData[];
    scoreFields: string[];
    csvHeaders: string[];
    status: string;
  } | null;
}

export default function TeamDashboardPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<TeamDashboardResponse | null>(() =>
    peekCachedJson<TeamDashboardResponse>(`/api/admin/teams/${teamId}`),
  );
  const [loading, setLoading] = useState(() => !peekCachedJson(`/api/admin/teams/${teamId}`));
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'rowIndex' | 'average'>('rowIndex');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [simulating, setSimulating] = useState(false);
  const [simulateMessage, setSimulateMessage] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!peekCachedJson(`/api/admin/teams/${teamId}`)) setLoading(true);
    setError('');
    try {
      const { status, ok, json } = await cachedJsonFetch<TeamDashboardResponse & { error?: string }>(
        `/api/admin/teams/${teamId}`,
      );
      if (status === 401) {
        router.push('/login');
        return;
      }
      if (!ok || !json) {
        setError(json?.error ?? `Failed to load team (${status}).`);
        return;
      }
      setData(json);
      if (json.dashboard?.applications) {
        setNotes((prev) => {
          const next = { ...prev };
          for (const app of json.dashboard!.applications) {
            if (!(app.id in next)) next[app.id] = app.adminNote ?? '';
          }
          return next;
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load team dashboard.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router, teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveNote = async (appId: number) => {
    setSavingNote(appId);
    const res = await fetch(`/api/admin/applications/${appId}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: notes[appId] ?? '', teamId: Number(teamId) }),
    });
    setSavingNote(null);
    if (res.ok) {
      toast.success('Note saved');
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error((json.error as string) ?? 'Failed to save note');
    }
  };

  const handleSimulateScores = async (
    stage: 'application' | 'first_round' | 'final_round' = 'application',
  ) => {
    setSimulating(true);
    setSimulateMessage('');
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(`/api/admin/teams/${teamId}/simulate-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Simulation failed.';
        setSimulateMessage(message);
        toast.error(message);
        return;
      }
      const stageLabel =
        stage === 'application'
          ? 'application'
          : stage === 'first_round'
            ? 'First Round'
            : 'Final Round';
      const message = `Filled ${json.assignmentsCompleted} ${stageLabel} assignments with random scores (${json.scoresWritten} scores).`;
      setSimulateMessage(message);
      toast.success('Test scores generated');
      // Team overview on the admin dashboard caches this endpoint — drop it so
      // navigating back shows the new progress immediately.
      invalidateClientFetchCache('/api/admin/dashboard');
      await fetchData();
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Simulation timed out. Try again. If the dev server stopped, restart it with npm run dev.'
          : 'Network error. If the page will not load, restart the dev server (npm run dev).';
      setSimulateMessage(message);
      toast.error(message);
    } finally {
      setSimulating(false);
    }
  };

  if (loading && !data) {
    return <PageLoading />;
  }

  if (error && !data) {
    return (
      <CenteredMessage
        title="Couldn't load team"
        description={error}
        ctaLabel="Try again"
        onCtaClick={() => fetchData()}
      />
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  if (!data.round) {
    return (
      <CenteredMessage
        icon={UploadIcon}
        title={data.team.name}
        description="No application round imported yet."
        ctaLabel="Import spreadsheet"
        ctaHref="/admin/import"
      />
    );
  }

  const roundStatus = data.round.status;
  const viewParam = searchParams.get('view');
  const adminView = parseAdminPhaseSlug(viewParam ?? '') ?? roundStatus;
  const isApplicationPhase = roundStatus === 'application';
  const isClosed = roundStatus === 'closed';
  const isDeliberationsLive = roundStatus === 'deliberations';
  const isDeliberationsView = adminView === 'deliberations';
  // After close, keep the full team hub (apps + links) — don't dump admin into a stub.
  const showApplicationHub = adminView === 'application' || isClosed;
  const isFirstRoundView = adminView === 'first_round';
  const isFinalRoundView = adminView === 'final_round';
  const isInterviewView = isFirstRoundView || isFinalRoundView;
  const interviewStage = isFinalRoundView ? 'final_round' : 'first_round';
  const phasePreview = isAdminPhasePreview(roundStatus, adminView);

  if (showApplicationHub && !data.dashboard) {
    return (
      <CenteredMessage
        icon={UploadIcon}
        title={data.team.name}
        description="Application data is not available yet."
        ctaLabel="Import spreadsheet"
        ctaHref="/admin/import"
      />
    );
  }

  const dashboard = data.dashboard;
  const sorted =
    showApplicationHub && dashboard
      ? [...dashboard.applications].sort((a, b) =>
          sortBy === 'average' ? (b.average ?? -1) - (a.average ?? -1) : a.rowIndex - b.rowIndex,
        )
      : [];

  const contextFields =
    showApplicationHub && dashboard
      ? dashboard.csvHeaders.filter((h) => !dashboard.scoreFields.includes(h))
      : [];
  const previewField =
    showApplicationHub && dashboard
      ? (dashboard.csvHeaders.find((h) => h === 'Full name') ??
        dashboard.csvHeaders.find((h) => h === 'First name') ??
        dashboard.csvHeaders.find((h) => h === 'Email') ??
        contextFields[0] ??
        dashboard.scoreFields[0])
      : null;

  const interviewStats = data.interviewStats ?? null;
  const sessionStatePreview =
    isInterviewView && searchParams.get('preview') === 'session-states';
  const schedulePath = isFinalRoundView
    ? `/admin/teams/${teamId}/schedule/final-round`
    : `/admin/teams/${teamId}/schedule/first-round`;
  const resultsPath = `/admin/teams/${teamId}/interview-results?stage=${interviewStage}`;
  const sampleApplicationId =
    showApplicationHub && dashboard ? dashboard.applications[0]?.id ?? null : null;
  const pageDescription =
    showApplicationHub && dashboard
      ? `${phaseLabel(adminView)} · ${dashboard.applications.length} applications`
      : `${phaseLabel(adminView)}${phasePreview ? ' · Preview' : ''}`;

  return (
    <PageContainer size="wide" className="space-y-8">
      {phasePreview && (
        <StatusBanner
          type="info"
          message={`Previewing ${phaseLabel(adminView).toLowerCase()} while the live pipeline is still in ${phaseLabel(roundStatus).toLowerCase()}. Team users cannot access this phase yet.`}
        />
      )}
      <PageHeader
        title={data.team.name}
        description={pageDescription}
        toolbar={
          <>
            {showApplicationHub && (
              <NavLinkButton
                variant="secondary"
                href={`/admin/teams/${teamId}/assignments`}
              >
                Edit assignments
              </NavLinkButton>
            )}
            <NavLinkButton
              variant="secondary"
              href={communicationsHref(
                outcomeEmailStageFromPipeline(isClosed ? 'deliberations' : roundStatus),
                Number(teamId),
              )}
            >
              Emails
            </NavLinkButton>
            <NavLinkButton
              variant="secondary"
              href={`/admin/teams/${teamId}/interview-setup`}
            >
              Interview Setup
            </NavLinkButton>
            <NavLinkButton
              variant="secondary"
              href={`/admin/teams/${teamId}/schedule/first-round`}
            >
              First Round Schedule
            </NavLinkButton>
            <NavLinkButton
              variant="secondary"
              href={`/admin/teams/${teamId}/schedule/final-round`}
            >
              Final Round Schedule
            </NavLinkButton>
            <NavLinkButton
              variant="secondary"
              href={openTeamDeliberationsHref(Number(teamId))}
            >
              Deliberations
            </NavLinkButton>
            {showApplicationHub && (
              <a href={`/api/admin/teams/${teamId}/export`} download>
                <LoadingButton variant="secondary">Export CSV</LoadingButton>
              </a>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <TeamStageControls teamId={Number(teamId)} />

      {isInterviewView ? (
        <>
          <div className="space-y-4">
          <div className="uma-stack-toolbar">
              <div className="flex min-w-0 flex-wrap gap-2">
                <NavLinkButton href={schedulePath}>Open Schedule</NavLinkButton>
                <NavLinkButton variant="secondary" href={resultsPath}>
                  View results
                </NavLinkButton>
              </div>
              {interviewStats && interviewStats.scoring.total > 0 && (
                <DestructiveConfirmDialog
                  title="Simulate Random Interview Scores?"
                  description={
                    <>
                      Fills every pending interviewer assignment for{' '}
                      {isFinalRoundView ? 'final' : 'first'} round with random 1–5 scores based on the
                      interview guide rubric. For testing only.
                      <br />
                      <br />
                      Existing completed scores are not changed.
                    </>
                  }
                  confirmLabel="Simulate Scores"
                  onConfirm={() =>
                    handleSimulateScores(isFinalRoundView ? 'final_round' : 'first_round')
                  }
                  trigger={<LoadingButton variant="secondary" disabled={simulating} />}
                  triggerLabel="Simulate Scores"
                />
              )}
            </div>
            {simulateMessage && (
              <p className="text-sm text-muted-foreground">{simulateMessage}</p>
            )}
            <AdminInterviewProgressDetail
              teamId={teamId}
              stage={interviewStage}
              sessionStatePreview={sessionStatePreview}
            />
          </div>
          {isFirstRoundView && (
            <AdminAdvancementReadinessPanel teamId={teamId} fromStage="first_round" />
          )}
        </>
      ) : isDeliberationsView ? (
        <Card>
          <CardHeader>
            <CardTitle>Deliberations Board</CardTitle>
            <CardDescription>
              {isDeliberationsLive
                ? 'Move candidates toward offers on the kanban board.'
                : 'Preview the deliberations board before candidates arrive in this phase.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NavLinkButton href={openTeamDeliberationsHref(Number(teamId))}>
              Open deliberations
            </NavLinkButton>
          </CardContent>
        </Card>
      ) : dashboard ? (
      <Tabs defaultValue="progress" className="space-y-6">
        <TabsList className="max-w-full flex-wrap">
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="grading">Grading Setup</TabsTrigger>
          <TabsTrigger value="applications">
            Applications <TitleCount>{dashboard.applications.length}</TitleCount>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="space-y-4">
          {isApplicationPhase && (
            <AdminAdvancementReadinessPanel teamId={teamId} fromStage="application" />
          )}
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div>
                <CardTitle>Grading Progress</CardTitle>
                <CardDescription>
                  {dashboard.progress.completed} of {dashboard.progress.total} grader assignments
                  complete
                </CardDescription>
              </div>
              {isApplicationPhase && (
                <DestructiveConfirmDialog
                  title="Simulate Random Scores?"
                  description={
                    <>
                      Fills every pending grader assignment with random 1–5 scores. For testing
                      only.
                      <br />
                      <br />
                      Existing completed scores are not changed.
                    </>
                  }
                  confirmLabel="Simulate Scores"
                  onConfirm={() => handleSimulateScores('application')}
                  trigger={<LoadingButton variant="secondary" size="sm" disabled={simulating} />}
                  triggerLabel="Simulate Scores"
                />
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {simulateMessage && (
                <p className="text-sm text-muted-foreground">{simulateMessage}</p>
              )}
              {dashboard.progress.total > 0 && (
                <Progress
                  value={Math.round(
                    (dashboard.progress.completed / dashboard.progress.total) * 100,
                  )}
                  max={100}
                  className="w-full gap-0 [&_[data-slot=progress-track]]:h-2"
                />
              )}
              <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                {dashboard.graders.map((g) => {
                  const done = g.total > 0 && g.completed === g.total;
                  return (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <span className="font-medium">{g.name}</span>
                      <span
                        className={cn(
                          'tabular-nums',
                          done ? 'font-medium text-emerald-700' : 'text-muted-foreground',
                        )}
                      >
                        {g.completed}/{g.total} scored
                      </span>
                    </li>
                  );
                })}
              </ul>
              {dashboard.progress.total > 0 &&
                dashboard.progress.completed === dashboard.progress.total && (
                  <p className="text-sm text-muted-foreground">
                    After Exec set color signals on their assignments, Directors submit the
                    advancement list on{' '}
                    <Link href="/admin/advancements" className="text-primary hover:underline">
                      Advancements
                    </Link>
                    .
                  </p>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grading" className="space-y-4">
          <TeamGradingSetup
            teamId={teamId}
            sampleApplicationId={sampleApplicationId}
            onSaved={fetchData}
          />
          <TeamTestAsExecPanel teamId={teamId} />
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {dashboard.applications.length} application
              {dashboard.applications.length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className={sortBy === 'rowIndex' ? 'font-medium text-primary' : 'text-muted-foreground'}
                onClick={() => setSortBy('rowIndex')}
              >
                By order
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                className={sortBy === 'average' ? 'font-medium text-primary' : 'text-muted-foreground'}
                onClick={() => setSortBy('average')}
              >
                By score
              </button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '44%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Applicant</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Graders</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Avg</th>
                    <th className="p-3 text-right font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sorted.map((app) => {
                    const label = previewField
                      ? app.fields[previewField] || `Application #${app.rowIndex}`
                      : `Application #${app.rowIndex}`;
                    const isExpanded = expanded.has(app.id);
                    return (
                      <Fragment key={app.id}>
                        <tr className="uma-hover-on-row">
                          <td className="p-3 tabular-nums text-muted-foreground">{app.rowIndex}</td>
                          <td className="min-w-0 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="min-w-0 truncate font-medium">{label}</p>
                              {app.rank !== null && (
                                <StageBadge label={`Rank ${app.rank}`} color="green" />
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {app.assignments.map((a) => (
                                <StageBadge
                                  key={a.assignmentId}
                                  label={`${a.graderName}: ${a.total ?? '–'}`}
                                  color={a.status === 'completed' ? 'green' : 'yellow'}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right font-medium tabular-nums">
                            {app.average !== null ? app.average.toFixed(2) : '–'}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              className="text-sm text-primary hover:underline"
                              onClick={() => toggleExpand(app.id)}
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${app.id}-detail`}>
                            <td colSpan={5} className="bg-background p-4">
                              <div className="space-y-4">
                                <div>
                                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Admin Note
                                  </p>
                                  <textarea
                                    value={notes[app.id] ?? ''}
                                    onChange={(e) =>
                                      setNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                                    }
                                    rows={2}
                                    className="field-textarea"
                                  />
                                  <div className="mt-2 flex items-center justify-end gap-2">
                                    <LoadingButton
                                      variant="secondary"
                                      loading={savingNote === app.id}
                                      onClick={() => handleSaveNote(app.id)}
                                    >
                                      Save note
                                    </LoadingButton>
                                  </div>
                                </div>
                                {app.assignments.map((a) => (
                                  <div
                                    key={a.assignmentId}
                                    className="space-y-2 rounded-lg border bg-background p-3"
                                  >
                                    <p className="font-medium">{a.graderName}</p>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                      {Object.entries(a.scores).map(([field, score]) => (
                                        <span key={field} className="text-sm text-muted-foreground">
                                          {field}:{' '}
                                          <strong className="text-foreground">{score}</strong>
                                        </span>
                                      ))}
                                    </div>
                                    {a.comment && (
                                      <p className="text-sm text-muted-foreground">{a.comment}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      ) : null}
      </div>
    </PageContainer>
  );
}
