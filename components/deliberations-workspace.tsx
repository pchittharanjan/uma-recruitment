'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Columns2Icon, PlusIcon, XIcon } from 'lucide-react';
import { DeliberationsTeamBoard } from '@/components/deliberations-team-board';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deliberationsWorkspaceHref,
  parseDeliberationsTabIds,
  readStoredDeliberationsTabIds,
  writeStoredDeliberationsTabIds,
} from '@/lib/deliberations-workspace';
import { cn } from '@/lib/utils';

type TeamOption = {
  id: number;
  name: string;
  hasRound: boolean;
};

function mergeTabIds(...lists: number[][]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const list of lists) {
    for (const id of list) {
      if (!Number.isFinite(id) || id < 1 || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function DeliberationsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

  const [openTabIds, setOpenTabIds] = useState<number[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  /** Tabs that have been focused at least once — stay mounted so unsaved board state is kept. */
  const [mountedTabIds, setMountedTabIds] = useState<number[]>([]);
  const [split, setSplit] = useState(false);
  const [splitTabId, setSplitTabId] = useState<number | null>(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const splitDragRef = useRef<{ startX: number; startRatio: number } | null>(null);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // Hydrate open tabs from URL + sessionStorage once.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const fromTabs = parseDeliberationsTabIds(searchParams.get('tabs'));
    const openId = Number.parseInt(searchParams.get('open') ?? '', 10);
    const fromOpen = Number.isFinite(openId) && openId >= 1 ? [openId] : [];
    const fromActive = Number.parseInt(searchParams.get('active') ?? '', 10);
    const stored = readStoredDeliberationsTabIds();

    const merged = mergeTabIds(fromTabs, fromOpen, stored);
    const preferredActive =
      (Number.isFinite(fromActive) && fromActive >= 1 && merged.includes(fromActive)
        ? fromActive
        : null) ??
      (fromOpen[0] && merged.includes(fromOpen[0]) ? fromOpen[0] : null) ??
      merged[0] ??
      null;

    setOpenTabIds(merged);
    setActiveTabId(preferredActive);
    if (preferredActive != null) setMountedTabIds([preferredActive]);
    writeStoredDeliberationsTabIds(merged);
    setReady(true);
  }, [searchParams]);

  // Soft-open: same-page links with ?open= add/focus a tab without remounting boards.
  useEffect(() => {
    if (!ready) return;
    const openId = Number.parseInt(searchParams.get('open') ?? '', 10);
    if (!Number.isFinite(openId) || openId < 1) return;
    setOpenTabIds((prev) => (prev.includes(openId) ? prev : [...prev, openId]));
    setActiveTabId(openId);
    setMountedTabIds((prev) => (prev.includes(openId) ? prev : [...prev, openId]));
  }, [ready, searchParams]);

  // Keep URL + sessionStorage in sync after hydration (replace, no history spam).
  useEffect(() => {
    if (!ready) return;
    writeStoredDeliberationsTabIds(openTabIds);
    const next = deliberationsWorkspaceHref({
      tabs: openTabIds,
      active: activeTabId,
    });
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      router.replace(next, { scroll: false });
    }
  }, [ready, openTabIds, activeTabId, router]);

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    fetch('/api/admin/teams', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        if (!res.ok) throw new Error('Failed to load teams.');
        return res.json() as Promise<{
          teams: Array<{ id: number; name: string; hasRound: boolean }>;
        }>;
      })
      .then((json) => {
        if (cancelled || !json) return;
        const options: TeamOption[] = json.teams.map((team) => ({
          id: team.id,
          name: team.name,
          hasRound: team.hasRound,
        }));
        setTeamOptions(options);
        setTeamNames((prev) => {
          const next = { ...prev };
          for (const team of options) next[team.id] = team.name;
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setTeamOptions([]);
      })
      .finally(() => {
        if (!cancelled) setTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const openTeam = useCallback((teamId: number) => {
    setOpenTabIds((prev) => (prev.includes(teamId) ? prev : [...prev, teamId]));
    setActiveTabId(teamId);
    setMountedTabIds((prev) => (prev.includes(teamId) ? prev : [...prev, teamId]));
  }, []);

  const closeTab = useCallback((teamId: number) => {
    setOpenTabIds((prev) => {
      const next = prev.filter((id) => id !== teamId);
      setActiveTabId((current) => {
        if (current !== teamId) return current;
        const closedIndex = prev.indexOf(teamId);
        return next[Math.min(closedIndex, next.length - 1)] ?? next[next.length - 1] ?? null;
      });
      return next;
    });
    setMountedTabIds((prev) => prev.filter((id) => id !== teamId));
    setSplitTabId((current) => (current === teamId ? null : current));
  }, []);

  const handleTeamMeta = useCallback((meta: { id: number; name: string }) => {
    setTeamNames((prev) =>
      prev[meta.id] === meta.name ? prev : { ...prev, [meta.id]: meta.name },
    );
  }, []);

  const closedTeams = teamOptions.filter(
    (team) => team.hasRound && !openTabIds.includes(team.id),
  );

  if (!ready) return <PageLoading />;

  return (
    <PageContainer size="wide" className="flex min-h-0 flex-col gap-4">
      <PageHeader
        title="Deliberations"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={split ? 'secondary' : 'outline'}
              size="sm"
              disabled={openTabIds.length < 2}
              title={openTabIds.length < 2 ? 'Open two teams to split' : 'Split boards'}
              onClick={() => {
                setSplit((prev) => {
                  const next = !prev;
                  if (next) {
                    const other = openTabIds.find((id) => id !== activeTabId) ?? openTabIds[0] ?? null;
                    setSplitTabId(other);
                    if (other != null) {
                      setMountedTabIds((mounted) =>
                        mounted.includes(other) ? mounted : [...mounted, other],
                      );
                    }
                  }
                  return next;
                });
              }}
            >
              <Columns2Icon data-icon="inline-start" />
              Split
            </Button>
            <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm" disabled={teamsLoading} />
              }
            >
              <PlusIcon data-icon="inline-start" />
              Open team
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {closedTeams.length === 0 ? (
                <DropdownMenuItem disabled>
                  {teamsLoading ? 'Loading teams…' : 'All teams are open'}
                </DropdownMenuItem>
              ) : (
                closedTeams.map((team) => (
                  <DropdownMenuItem key={team.id} onClick={() => openTeam(team.id)}>
                    {team.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg bg-muted/40">
        <div
          role="tablist"
          aria-label="Deliberations team boards"
          className="flex items-stretch gap-0 overflow-x-auto bg-muted/55"
        >
          {openTabIds.length === 0 ? (
            <div className="px-4 py-2.5 text-sm text-muted-foreground">No boards open</div>
          ) : (
            openTabIds.map((teamId) => {
              const isActive = teamId === activeTabId;
              const label = teamNames[teamId] ?? `Team ${teamId}`;
              return (
                <div
                  key={teamId}
                  className={cn(
                    'group flex max-w-56 shrink-0 items-center gap-0.5',
                    isActive
                      ? 'bg-background text-foreground'
                      : 'bg-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    id={`delib-tab-${teamId}`}
                    aria-controls={`delib-panel-${teamId}`}
                    className={cn(
                      'min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm',
                      isActive && 'font-medium',
                    )}
                    onClick={() => {
                      setActiveTabId(teamId);
                      setMountedTabIds((prev) =>
                        prev.includes(teamId) ? prev : [...prev, teamId],
                      );
                    }}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${label}`}
                    className={cn(
                      'mr-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                      'opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-70 group-focus-within:opacity-70',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(teamId);
                    }}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={cn('min-h-0 flex-1', split && openTabIds.length > 0 ? 'flex overflow-hidden' : 'overflow-auto p-4 sm:p-5')}>
          {openTabIds.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-4 py-8 sm:p-5">
              <p className="text-sm text-muted-foreground">
                Open a team board to start deliberations. You can keep several boards open and
                switch between them like browser tabs.
              </p>
              {closedTeams.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {closedTeams.map((team) => (
                    <Button
                      key={team.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openTeam(team.id)}
                    >
                      {team.name}
                    </Button>
                  ))}
                </div>
              )}
              {!teamsLoading && closedTeams.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No teams with an active round are available yet.
                </p>
              )}
            </div>
          ) : split ? (
            <>
              <div className="min-h-0 overflow-auto p-4 sm:p-5" style={{ width: `${splitRatio}%` }}>
                {activeTabId != null && mountedTabIds.includes(activeTabId) && (
                  <DeliberationsTeamBoard
                    teamId={activeTabId}
                    onTeamMeta={handleTeamMeta}
                    canSave
                  />
                )}
              </div>
              <button
                type="button"
                aria-label="Resize split"
                className="w-1.5 shrink-0 cursor-ew-resize bg-border hover:bg-primary/60"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  splitDragRef.current = { startX: event.clientX, startRatio: splitRatio };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = splitDragRef.current;
                  if (!drag) return;
                  const parent = event.currentTarget.parentElement;
                  if (!parent) return;
                  const deltaPct = ((event.clientX - drag.startX) / parent.clientWidth) * 100;
                  setSplitRatio(Math.min(75, Math.max(25, drag.startRatio + deltaPct)));
                }}
                onPointerUp={(event) => {
                  splitDragRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <p className="text-xs text-muted-foreground">Right</p>
                  <select
                    aria-label="Right board"
                    className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    value={splitTabId ?? ''}
                    onChange={(event) => {
                      const nextId = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(nextId)) return;
                      setSplitTabId(nextId);
                      setMountedTabIds((prev) =>
                        prev.includes(nextId) ? prev : [...prev, nextId],
                      );
                    }}
                  >
                    {openTabIds
                      .filter((id) => id !== activeTabId)
                      .map((id) => (
                        <option key={id} value={id}>
                          {teamNames[id] ?? `Team ${id}`}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
                  {splitTabId != null && splitTabId !== activeTabId && (
                    <DeliberationsTeamBoard
                      teamId={splitTabId}
                      onTeamMeta={handleTeamMeta}
                      canSave
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            openTabIds.map((teamId) => {
              const isActive = teamId === activeTabId;
              const hasMounted = mountedTabIds.includes(teamId);
              // Lazy-mount on first focus; keep mounted (hidden) so unsaved edits survive tab switches.
              if (!hasMounted) {
                return (
                  <div
                    key={teamId}
                    role="tabpanel"
                    id={`delib-panel-${teamId}`}
                    aria-labelledby={`delib-tab-${teamId}`}
                    hidden
                    className="hidden"
                  />
                );
              }
              return (
                <div
                  key={teamId}
                  role="tabpanel"
                  id={`delib-panel-${teamId}`}
                  aria-labelledby={`delib-tab-${teamId}`}
                  hidden={!isActive}
                  className={cn(!isActive && 'hidden')}
                >
                  <DeliberationsTeamBoard
                    teamId={teamId}
                    onTeamMeta={handleTeamMeta}
                    canSave
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </PageContainer>
  );
}
