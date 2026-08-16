'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ApplicationStage } from '@/lib/db';
import { displayApplicantId } from '@/lib/applicant-id';
import { applicationStageLabel } from '@/lib/stages';

interface Team {
  id: number;
  name: string;
}

interface ApplicationRow {
  id: number;
  rowIndex: number;
  stage: ApplicationStage;
  teamId: number;
  teamName: string;
  roundId: number;
  candidateId: number;
  candidateName: string;
  candidateEmail: string;
  finalScore: number | null;
  rank: number | null;
  adminNote: string | null;
  graderCompleted: number;
  graderTotal: number;
}

interface ApplicationDetail extends ApplicationRow {
  fields: Record<string, string>;
}

type SortKey =
  | 'id'
  | 'rowIndex'
  | 'name'
  | 'email'
  | 'team'
  | 'stage'
  | 'score'
  | 'rank'
  | 'graders';
type SortDir = 'asc' | 'desc';

const STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All stages' },
  { value: 'application', label: 'Application' },
  { value: 'first_round', label: 'First Round Interview' },
  { value: 'final_round', label: 'Final Round Interview' },
  { value: 'deliberations', label: 'Deliberations' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'rejected', label: 'Rejected' },
];

function stageBadgeColor(stage: ApplicationStage): 'blue' | 'green' | 'gray' | 'yellow' | 'orange' {
  switch (stage) {
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

function compareApplications(
  a: ApplicationRow,
  b: ApplicationRow,
  key: SortKey,
  dir: SortDir,
): number {
  let cmp = 0;
  switch (key) {
    case 'id':
      cmp = a.id - b.id;
      break;
    case 'rowIndex':
      cmp = a.rowIndex - b.rowIndex;
      break;
    case 'name':
      cmp = a.candidateName.localeCompare(b.candidateName, undefined, { sensitivity: 'base' });
      break;
    case 'email':
      cmp = a.candidateEmail.localeCompare(b.candidateEmail, undefined, { sensitivity: 'base' });
      break;
    case 'team':
      cmp = a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' });
      break;
    case 'stage':
      cmp = applicationStageLabel(a.stage).localeCompare(applicationStageLabel(b.stage), undefined, {
        sensitivity: 'base'});
      break;
    case 'score':
      cmp = (a.finalScore ?? -1) - (b.finalScore ?? -1);
      break;
    case 'rank':
      cmp = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
      break;
    case 'graders':
      cmp =
        a.graderCompleted / Math.max(a.graderTotal, 1) -
        b.graderCompleted / Math.max(b.graderTotal, 1);
      break;
  }
  if (cmp === 0) {
    cmp = a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' });
  }
  if (cmp === 0) {
    cmp = a.rowIndex - b.rowIndex;
  }
  if (cmp === 0) {
    cmp = a.id - b.id;
  }
  return dir === 'asc' ? cmp : -cmp;
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
  title,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  title?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={cn('p-3 text-left font-medium text-muted-foreground', className)}>
      <button
        type="button"
        title={title}
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )
        ) : (
          <ChevronsUpDownIcon className="size-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

function otherTeamsForApplicant(
  app: ApplicationRow,
  teamsByEmail: Map<string, string[]>,
): string[] {
  const teams = teamsByEmail.get(app.candidateEmail.toLowerCase()) ?? [];
  return teams.filter((team) => team !== app.teamName);
}

export default function AdminApplicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState(() => searchParams.get('teamId') ?? 'all');
  const [stageFilter, setStageFilter] = useState('all');

  useEffect(() => {
    const teamId = searchParams.get('teamId');
    if (teamId) setTeamFilter(teamId);
  }, [searchParams]);

  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<ApplicationRow | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (teamFilter !== 'all') params.set('teamId', teamFilter);
      if (stageFilter !== 'all') params.set('stage', stageFilter);

      const res = await fetch(`/api/admin/applications?${params.toString()}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load applications');
        return;
      }
      setApplications(json.applications ?? []);
      setTeams(json.teams ?? []);
    } catch {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [router, searchQuery, teamFilter, stageFilter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const sortedApplications = useMemo(
    () => [...applications].sort((a, b) => compareApplications(a, b, sortKey, sortDir)),
    [applications, sortKey, sortDir],
  );

  const teamsByEmail = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const app of applications) {
      const key = app.candidateEmail.toLowerCase();
      const teams = map.get(key) ?? [];
      if (!teams.includes(app.teamName)) teams.push(app.teamName);
      map.set(key, teams);
    }
    return map;
  }, [applications]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openDetail = async (app: ApplicationRow) => {
    setSelectedId(app.id);
    setSelectedRow(app);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/applications/${app.id}`);
      const json = await res.json();
      if (res.ok && json.application) {
        setDetail(json.application);
      } else {
        const message = json.error ?? 'Failed to load details';
        setDetailError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Failed to load details';
      setDetailError(message);
      toast.error(message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const res = await fetch(`/api/admin/applications/${detail.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: detail.teamId })});
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Delete failed');
      return;
    }
    toast.success(`Removed applicant ${detail.id} (${detail.candidateName})`);
    setSelectedId(null);
    setDetail(null);
    setDeleteOpen(false);
    await fetchApplications();
  };

  const sheetApp = detail ?? selectedRow;

  if (loading && applications.length === 0 && !error) {
    return <PageLoading />;
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Applications"
        description="One row per team application. Same person on two teams = two rows (separate App IDs). List # is the blind ID for that team's graders."
      />

      {error && <StatusBanner message={error} type="error" />}

      <PageSection>
        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>All applications ({applications.length})</CardTitle>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="relative min-w-[200px] flex-1">
                <Label htmlFor="app-search" className="sr-only">
                  Search
                </Label>
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="app-search"
                  placeholder="Search name, email, applicant ID…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-filter">Team</Label>
                <NativeSelect
                  id="team-filter"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="min-w-[140px]"
                >
                  <option value="all">All teams</option>
                  {teams.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stage-filter">Stage</Label>
                <NativeSelect
                  id="stage-filter"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="min-w-[140px]"
                >
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sortedApplications.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                {searchQuery || teamFilter !== 'all' || stageFilter !== 'all'
                  ? 'No applications match your filters.'
                  : 'No applications yet. Import CSV to get started.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '8%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <SortableHeader
                        label="App ID"
                        sortKey="id"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="List #"
                        sortKey="rowIndex"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        title="Blind number Exec see on this team's list"
                      />
                      <SortableHeader
                        label="Name"
                        sortKey="name"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Email"
                        sortKey="email"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Team"
                        sortKey="team"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Stage"
                        sortKey="stage"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Score"
                        sortKey="score"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Rank"
                        sortKey="rank"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Graders"
                        sortKey="graders"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sortedApplications.map((app) => (
                      <tr
                        key={app.id}
                        onClick={() => openDetail(app)}
                        className={cn(
                          'cursor-pointer hover:bg-muted/30',
                          selectedId === app.id && 'bg-muted/40',
                        )}
                      >
                        <td className="p-3 font-mono tabular-nums text-muted-foreground">{app.id}</td>
                        <td className="p-3 font-mono font-medium tabular-nums">
                          #{displayApplicantId(app.rowIndex)}
                        </td>
                        <td className="min-w-0 p-3">
                          <div className="truncate font-medium">{app.candidateName}</div>
                          {otherTeamsForApplicant(app, teamsByEmail).length > 0 && (
                            <p className="truncate text-sm text-muted-foreground">
                              Also on {otherTeamsForApplicant(app, teamsByEmail).join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="min-w-0 truncate p-3 text-muted-foreground">
                          {app.candidateEmail}
                        </td>
                        <td className="p-3">
                          <StageBadge label={app.teamName} color="gray" />
                        </td>
                        <td className="p-3">
                          <StageBadge
                            label={applicationStageLabel(app.stage)}
                            color={stageBadgeColor(app.stage)}
                          />
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {app.finalScore != null ? app.finalScore.toFixed(2) : '—'}
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {app.rank ?? '—'}
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {app.graderCompleted}/{app.graderTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageSection>

      <Sheet
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setSelectedRow(null);
            setDetail(null);
            setDetailError('');
          }
        }}
      >
        <SheetContent side="right" size="lg" className="overflow-y-auto">
          {!sheetApp ? (
            <div className="space-y-4 px-4 py-6" role="status" aria-label="Loading">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>{sheetApp.candidateName}</SheetTitle>
                <SheetDescription>
                  App ID {sheetApp.id} · {sheetApp.teamName} · List #
                  {displayApplicantId(sheetApp.rowIndex)} · {sheetApp.candidateEmail}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                {detailError && <StatusBanner message={detailError} type="error" />}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Person</dt>
                    <dd className="truncate font-medium">{sheetApp.candidateName}</dd>
                    {otherTeamsForApplicant(sheetApp, teamsByEmail).length > 0 && (
                      <dd className="mt-1 text-sm text-muted-foreground">
                        Also applied to {otherTeamsForApplicant(sheetApp, teamsByEmail).join(', ')}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-muted-foreground">This application</dt>
                    <dd className="font-mono tabular-nums">App ID {sheetApp.id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">List #</dt>
                    <dd className="font-mono font-medium">#{displayApplicantId(sheetApp.rowIndex)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Team</dt>
                    <dd className="font-medium">{sheetApp.teamName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stage</dt>
                    <dd>
                      <StageBadge
                        label={applicationStageLabel(sheetApp.stage)}
                        color={stageBadgeColor(sheetApp.stage)}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Score</dt>
                    <dd className="tabular-nums">
                      {sheetApp.finalScore != null ? sheetApp.finalScore.toFixed(2) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Rank</dt>
                    <dd className="tabular-nums">{sheetApp.rank ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Graders</dt>
                    <dd className="tabular-nums">
                      {sheetApp.graderCompleted}/{sheetApp.graderTotal} completed
                    </dd>
                  </div>
                </dl>

                {sheetApp.adminNote && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Admin Note
                    </p>
                    <p className="display-field">{sheetApp.adminNote}</p>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Application fields
                  </p>
                  {detailLoading ? (
                    <div className="space-y-2" role="status" aria-label="Loading">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-4/6" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : detail ? (
                    <ApplicationFieldsList fields={detail.fields} />
                  ) : detailError ? (
                    <p className="text-sm text-muted-foreground">
                      Application fields could not be loaded.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/teams/${sheetApp.teamId}`} />}
                  >
                    Open team
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                    disabled={!detail}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {detail && (
                <DestructiveConfirmDialog
                  open={deleteOpen}
                  onOpenChange={setDeleteOpen}
                  title="Delete application?"
                  description={
                    <>
                      Remove <strong>{detail.candidateName}</strong> (App ID {detail.id}, list #
                      {displayApplicantId(detail.rowIndex)} on {detail.teamName})? This deletes
                      scores, assignments, and flags for this application. The applicant record
                      stays if they applied to other teams.
                    </>
                  }
                  confirmLabel="Delete application"
                  onConfirm={handleDelete}
                />
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
