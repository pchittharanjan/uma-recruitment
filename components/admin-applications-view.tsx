'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PageContainer, PageHeader, PageSection, TitleCount } from '@/components/page-shell';
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
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ApplicationStage } from '@/lib/db';
import { displayApplicantId } from '@/lib/applicant-id';
import { applicationStageLabel } from '@/lib/stages';
import { cachedJsonFetch, peekCachedJson } from '@/lib/client-fetch-cache';
import { teamBadgeClass } from '@/lib/team-colors';

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
  tooltip,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  tooltip: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={cn('overflow-hidden p-3 text-left font-medium text-muted-foreground', className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => onSort(sortKey)}
              className="inline-flex max-w-full items-center gap-1 hover:text-foreground"
            >
              <span className="whitespace-nowrap">{label}</span>
              {active ? (
                dir === 'asc' ? (
                  <ArrowUpIcon className="size-4 shrink-0" />
                ) : (
                  <ArrowDownIcon className="size-4 shrink-0" />
                )
              ) : (
                <ChevronsUpDownIcon className="size-4 shrink-0 opacity-40" />
              )}
            </button>
          }
        />
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </th>
  );
}

function DetailStat({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="cursor-help text-left font-normal normal-case text-muted-foreground decoration-muted-foreground/40 decoration-dotted underline-offset-4 hover:text-foreground hover:underline"
              >
                {label}
              </button>
            }
          />
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
      </dt>
      <dd className="mt-1 min-w-0 text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

const SHEET_WIDTH_KEY = 'uma-application-sheet-width';
const SHEET_WIDTH_MIN = 380;
const SHEET_WIDTH_DEFAULT = 540;

function clampSheetWidth(width: number): number {
  const max = typeof window === 'undefined' ? 720 : Math.round(window.innerWidth * 0.85);
  return Math.min(max, Math.max(SHEET_WIDTH_MIN, Math.round(width)));
}

function readSheetWidth(): number {
  if (typeof window === 'undefined') return SHEET_WIDTH_DEFAULT;
  const raw = window.localStorage.getItem(SHEET_WIDTH_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return clampSheetWidth(Number.isFinite(parsed) ? parsed : SHEET_WIDTH_DEFAULT);
}

function otherTeamsForApplicant(
  app: ApplicationRow,
  teamsByEmail: Map<string, string[]>,
): string[] {
  const teams = teamsByEmail.get(app.candidateEmail.toLowerCase()) ?? [];
  return teams.filter((team) => team !== app.teamName);
}

export type AdminApplicationsInitialData = {
  applications: ApplicationRow[];
  teams: Team[];
  total: number;
  allCount: number;
  hasMore: boolean;
};

function applicationsListUrl(params: {
  searchQuery: string;
  teamFilter: string;
  stageFilter: string;
  offset: number;
}): string {
  const search = new URLSearchParams();
  if (params.searchQuery) search.set('q', params.searchQuery);
  if (params.teamFilter !== 'all') search.set('teamId', params.teamFilter);
  if (params.stageFilter !== 'all') search.set('stage', params.stageFilter);
  search.set('limit', '150');
  search.set('offset', String(params.offset));
  return `/api/admin/applications?${search.toString()}`;
}

export function AdminApplicationsView({
  initialData,
  initialTeamFilter = 'all',
}: {
  initialData: AdminApplicationsInitialData;
  initialTeamFilter?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultListUrl = applicationsListUrl({
    searchQuery: '',
    teamFilter: initialTeamFilter,
    stageFilter: 'all',
    offset: 0,
  });
  const [applications, setApplications] = useState<ApplicationRow[]>(() =>
    peekCachedJson<{ applications?: ApplicationRow[] }>(defaultListUrl)?.applications ??
      initialData.applications,
  );
  const [teams, setTeams] = useState<Team[]>(() =>
    peekCachedJson<{ teams?: Team[] }>(defaultListUrl)?.teams ?? initialData.teams,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [total, setTotal] = useState(initialData.total);
  const [allCount, setAllCount] = useState(initialData.allCount);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState(() => searchParams.get('teamId') ?? initialTeamFilter);
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
  const [sheetWidth, setSheetWidth] = useState(SHEET_WIDTH_DEFAULT);
  const sheetDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setSheetWidth(readSheetWidth());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchApplications = useCallback(
    async (opts?: { append?: boolean; offset?: number; signal?: AbortSignal }) => {
      const append = Boolean(opts?.append);
      const offset = opts?.offset ?? 0;
      const url = applicationsListUrl({ searchQuery, teamFilter, stageFilter, offset });
      if (append) setLoadingMore(true);
      else if (!peekCachedJson(url)) setLoading(true);
      setError('');
      try {
        const { status, ok, json } = await cachedJsonFetch<{
          applications?: ApplicationRow[];
          teams?: Team[];
          total?: number;
          allCount?: number;
          hasMore?: boolean;
          error?: string;
        }>(url, { init: { signal: opts?.signal } });

        if (status === 401) {
          router.push('/login');
          return;
        }
        if (!ok || !json) {
          setError(json?.error ?? 'Failed to load applications');
          return;
        }
        const nextRows = json.applications ?? [];
        setApplications((prev) => (append ? [...prev, ...nextRows] : nextRows));
        setTeams(json.teams ?? []);
        setTotal(typeof json.total === 'number' ? json.total : nextRows.length);
        setAllCount(
          typeof json.allCount === 'number'
            ? json.allCount
            : typeof json.total === 'number'
              ? json.total
              : nextRows.length,
        );
        setHasMore(Boolean(json.hasMore));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setError('Failed to load applications');
      } finally {
        if (!opts?.signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [router, searchQuery, teamFilter, stageFilter],
  );

  useEffect(() => {
    const isDefaultQuery =
      !searchQuery && teamFilter === initialTeamFilter && stageFilter === 'all';
    if (isDefaultQuery && applications.length > 0) return;

    const controller = new AbortController();
    void fetchApplications({ append: false, offset: 0, signal: controller.signal });
    return () => controller.abort();
  }, [fetchApplications, searchQuery, teamFilter, stageFilter, initialTeamFilter, applications.length]);

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
    await fetchApplications({ append: false, offset: 0 });
  };

  const sheetApp = detail ?? selectedRow;

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Applications"
        description="One row per team application. Same person on two teams = two Application IDs. Applicant # is that team's number (what graders see)."
      />

      {error && <StatusBanner message={error} type="error" />}

      <PageSection>
        <Card className="gap-3 py-4">
          <CardHeader className="gap-2 space-y-0">
            <CardTitle className="flex items-baseline gap-2.5">
              Applications
              <TitleCount>
                {applications.length} of {applications.length < total ? total : allCount || total}
              </TitleCount>
            </CardTitle>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="relative min-w-[200px] flex-1">
                <Label htmlFor="app-search" className="sr-only">
                  Search
                </Label>
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="app-search"
                  placeholder="Search name, email, Application ID, Applicant #…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="bg-background pl-9"
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
          <CardContent className="p-0" aria-busy={loading}>
            {sortedApplications.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                {loading
                  ? 'Searching…'
                  : searchQuery || teamFilter !== 'all' || stageFilter !== 'all'
                    ? 'No applications match your filters.'
                    : 'No applications yet. Import CSV to get started.'}
              </p>
            ) : (
              <div
                className={cn(
                  'overflow-hidden px-(--card-spacing) transition-opacity',
                  loading && 'pointer-events-none opacity-60',
                )}
              >
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '9%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <SortableHeader
                        label="Application ID"
                        sortKey="id"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="Unique file number for this team application. Same person on two teams gets two IDs."
                      />
                      <SortableHeader
                        label="Applicant #"
                        sortKey="rowIndex"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="This team's number for this person. What graders see instead of a name."
                      />
                      <SortableHeader
                        label="Name"
                        sortKey="name"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="The candidate's name. “Also on …” means they applied to another team too."
                      />
                      <SortableHeader
                        label="Email"
                        sortKey="email"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="Berkeley email for this person."
                      />
                      <SortableHeader
                        label="Team"
                        sortKey="team"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="Which team this application is for."
                      />
                      <SortableHeader
                        label="Stage"
                        sortKey="stage"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="Where they are in this team's pipeline."
                      />
                      <SortableHeader
                        label="Score"
                        sortKey="score"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="Average score for this application on this team."
                      />
                      <SortableHeader
                        label="Rank"
                        sortKey="rank"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="Place on this team's scored list. 1 is the highest score."
                      />
                      <SortableHeader
                        label="Graders"
                        sortKey="graders"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        tooltip="How many people finished scoring this file, out of how many were assigned. Includes interviewers."
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sortedApplications.map((app) => (
                      <tr
                        key={app.id}
                        onClick={() => openDetail(app)}
                        className={cn(
                          'cursor-pointer',
                          selectedId === app.id && 'bg-background',
                        )}
                      >
                        <td className="overflow-hidden p-3 font-mono tabular-nums text-muted-foreground">
                          {app.id}
                        </td>
                        <td className="overflow-hidden p-3 font-mono font-medium tabular-nums">
                          #{displayApplicantId(app.rowIndex)}
                        </td>
                        <td className="min-w-0 overflow-hidden p-3">
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
                        <td className="min-w-0 overflow-hidden p-3">
                          <Badge className={cn('border-0 font-medium', teamBadgeClass(app.teamName))}>
                            {app.teamName}
                          </Badge>
                        </td>
                        <td className="min-w-0 overflow-hidden p-3">
                          <StageBadge
                            label={applicationStageLabel(app.stage)}
                            color={stageBadgeColor(app.stage)}
                            size="compact"
                          />
                        </td>
                        <td className="overflow-hidden p-3 tabular-nums text-muted-foreground">
                          {app.finalScore != null ? app.finalScore.toFixed(2) : '-'}
                        </td>
                        <td className="overflow-hidden p-3 tabular-nums text-muted-foreground">
                          {app.rank ?? '-'}
                        </td>
                        <td className="overflow-hidden p-3 tabular-nums text-muted-foreground">
                          {app.graderCompleted}/{app.graderTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasMore && (
              <div className="flex justify-center border-t border-border px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() =>
                    void fetchApplications({ append: true, offset: applications.length })
                  }
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
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
        <SheetContent
          side="right"
          size="lg"
          className="relative gap-0 overflow-hidden p-0 data-[side=right]:w-auto data-[side=right]:max-w-[85vw] data-[side=right]:min-w-[22rem] data-[side=right]:sm:w-auto"
          style={{ width: sheetWidth }}
        >
          <button
            type="button"
            aria-label="Drag to resize panel"
            className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize border-0 bg-transparent p-0 hover:bg-primary/25"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              sheetDragRef.current = { startX: event.clientX, startWidth: sheetWidth };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = sheetDragRef.current;
              if (!drag) return;
              const next = clampSheetWidth(drag.startWidth - (event.clientX - drag.startX));
              setSheetWidth(next);
            }}
            onPointerUp={(event) => {
              const drag = sheetDragRef.current;
              sheetDragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              if (!drag) return;
              const next = clampSheetWidth(drag.startWidth - (event.clientX - drag.startX));
              setSheetWidth(next);
              window.localStorage.setItem(SHEET_WIDTH_KEY, String(next));
            }}
          />
          {!sheetApp ? (
            <div className="space-y-4 px-6 py-6" role="status" aria-label="Loading">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <SheetHeader className="shrink-0 space-y-1 border-b border-border/70 px-6 py-4 pr-14">
                <SheetTitle className="truncate text-lg">{sheetApp.candidateName}</SheetTitle>
                <SheetDescription className="truncate">
                  Application ID {sheetApp.id} · {sheetApp.teamName} · Applicant #
                  {displayApplicantId(sheetApp.rowIndex)} · {sheetApp.candidateEmail}
                </SheetDescription>
              </SheetHeader>

              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
                {detailError && <StatusBanner message={detailError} type="error" />}

                <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-muted/40 px-4 py-4">
                  <DetailStat
                    label="Person"
                    tooltip="The candidate. “Also applied to …” means they have another team file."
                  >
                    <span className="block truncate">{sheetApp.candidateName}</span>
                    {otherTeamsForApplicant(sheetApp, teamsByEmail).length > 0 && (
                      <span className="mt-0.5 block truncate text-sm font-normal text-muted-foreground">
                        Also applied to {otherTeamsForApplicant(sheetApp, teamsByEmail).join(', ')}
                      </span>
                    )}
                  </DetailStat>
                  <DetailStat
                    label="This application"
                    tooltip="Unique file number for this team application."
                  >
                    <span className="font-mono tabular-nums">Application ID {sheetApp.id}</span>
                  </DetailStat>
                  <DetailStat
                    label="Applicant #"
                    tooltip="This team's number for this person. What graders see instead of a name."
                  >
                    <span className="font-mono tabular-nums">
                      #{displayApplicantId(sheetApp.rowIndex)}
                    </span>
                  </DetailStat>
                  <DetailStat label="Team" tooltip="Which team this application is for.">
                    <Badge className={cn('border-0 font-medium', teamBadgeClass(sheetApp.teamName))}>
                      {sheetApp.teamName}
                    </Badge>
                  </DetailStat>
                  <DetailStat
                    label="Stage"
                    tooltip="Where they are in this team's pipeline."
                  >
                    <StageBadge
                      label={applicationStageLabel(sheetApp.stage)}
                      color={stageBadgeColor(sheetApp.stage)}
                      size="compact"
                    />
                  </DetailStat>
                  <DetailStat
                    label="Score"
                    tooltip="Average score for this application on this team."
                  >
                    <span className="tabular-nums">
                      {sheetApp.finalScore != null ? sheetApp.finalScore.toFixed(2) : '-'}
                    </span>
                  </DetailStat>
                  <DetailStat
                    label="Rank"
                    tooltip="Place on this team's scored list. 1 is the highest score."
                  >
                    <span className="tabular-nums">{sheetApp.rank ?? '-'}</span>
                  </DetailStat>
                  <DetailStat
                    label="Graders"
                    tooltip="How many people finished scoring this file, out of how many were assigned. Includes interviewers."
                  >
                    <span className="tabular-nums">
                      {sheetApp.graderCompleted}/{sheetApp.graderTotal} completed
                    </span>
                  </DetailStat>
                </dl>

                {sheetApp.adminNote && (
                  <div className="mb-6">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Admin Note
                    </p>
                    <p className="display-field">{sheetApp.adminNote}</p>
                  </div>
                )}

                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

                <div className="mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-4">
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
                    className="text-destructive hover:bg-destructive/15 hover:text-destructive"
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
                      Remove <strong>{detail.candidateName}</strong> (Application ID {detail.id},
                      Applicant #{displayApplicantId(detail.rowIndex)} on {detail.teamName})? This
                      deletes scores, assignments, and flags for this application. The person
                      record stays if they applied to other teams.
                    </>
                  }
                  confirmLabel="Delete application"
                  onConfirm={handleDelete}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
