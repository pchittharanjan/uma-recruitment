'use client';

import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  BanIcon,
  Columns2Icon,
  GripVerticalIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApplicantCompareBar,
  ApplicantCompareDialog,
} from '@/components/applicant-compare';
import { DeliberationsCandidateDetailPanel } from '@/components/deliberations-candidate-detail';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import LoadingButton from '@/components/loading-button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanMoveEvent,
} from '@/components/ui/kanban';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { displayApplicantId } from '@/lib/applicant-id';
import {
  DELIBERATIONS_SORT_METRICS,
  sortColumnsByScore,
  type DeliberationsSortDirection,
  type DeliberationsSortMetric,
} from '@/lib/deliberations-sort';
import type {
  DeliberationsBoardLayout,
  DeliberationsCandidate,
  DeliberationsColumnId,
} from '@/lib/deliberations-types';
import {
  layoutsEqual,
  serializeDeliberationsLayout,
} from '@/lib/deliberations-types';
import { cn } from '@/lib/utils';

const COMPARE_MAX = 8;

const CLICK_MOVE_THRESHOLD_PX = 8;

const COLUMN_WELL = 'border-border bg-muted/60';

const COLUMN_META: Record<
  DeliberationsColumnId,
  {
    title: string;
    accent: string;
    description: string;
    card: string;
  }
> = {
  pool: {
    title: 'Pool',
    accent: 'bg-sky-600',
    description: 'All deliberation candidates',
    card: 'border-sky-300 bg-sky-100 text-foreground',
  },
  considering: {
    title: 'Considering',
    accent: 'bg-amber-600',
    description: 'Shortlist in discussion',
    card: 'border-amber-300 bg-amber-100 text-foreground',
  },
  accept: {
    title: 'Accept',
    accent: 'bg-green-600',
    description: 'Offer slots',
    card: 'border-green-300 bg-green-100 text-foreground',
  },
};

const REJECTED_CARD =
  'border-red-400 bg-red-100 text-foreground shadow-sm';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  return (
    <Badge className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums text-white">
      {label} {formatScore(value)}
    </Badge>
  );
}

interface ApplicantCardProps extends Omit<ComponentProps<typeof KanbanItem>, 'value' | 'children'> {
  candidate: DeliberationsCandidate;
  columnId: DeliberationsColumnId;
  isOverlay?: boolean;
  inCompare?: boolean;
  onOpen?: (candidate: DeliberationsCandidate) => void;
  onToggleRejected?: (candidateId: string) => void;
  onToggleCompare?: (candidateId: string) => void;
}

function ApplicantCard({
  candidate,
  columnId,
  isOverlay,
  inCompare,
  onOpen,
  onToggleRejected,
  onToggleCompare,
  ...props
}: ApplicantCardProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const meta = COLUMN_META[columnId];

  const handlePointerDown = (event: ReactPointerEvent) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!onOpen || isOverlay) return;
    // Ignore clicks that originated on interactive controls.
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-card-action]')) return;

    const start = pointerStart.current;
    pointerStart.current = null;
    if (start) {
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > CLICK_MOVE_THRESHOLD_PX || dy > CLICK_MOVE_THRESHOLD_PX) return;
    }
    onOpen(candidate);
  };

  const card = (
    <Card
      size="sm"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={cn(
        'overflow-hidden border shadow-sm ring-0 transition-shadow',
        candidate.rejected ? REJECTED_CARD : meta.card,
        !isOverlay && 'rotate-0 cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
        isOverlay && 'shadow-md ring-2 ring-primary/25',
        inCompare && !isOverlay && 'ring-2 ring-foreground/40',
      )}
    >
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold leading-snug text-foreground">
                {candidate.name}
              </h3>
              {candidate.rejected ? (
                <Badge className="shrink-0 border-0 bg-red-600 px-1.5 py-0 text-[0.65rem] font-semibold text-white">
                  Rejected
                </Badge>
              ) : null}
              {inCompare ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-foreground/30 bg-white px-1.5 py-0 text-[0.65rem] font-semibold text-foreground"
                >
                  Compare
                </Badge>
              ) : null}
            </div>
            <p className="text-xs tabular-nums text-foreground/80">
              Row {displayApplicantId(candidate.rowIndex)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isOverlay && (onToggleRejected || onToggleCompare) ? (
              <div
                data-card-action
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-foreground/70 hover:text-foreground"
                        aria-label={`Actions for ${candidate.name}`}
                      />
                    }
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    {onToggleCompare ? (
                      <DropdownMenuItem
                        className="whitespace-nowrap"
                        onClick={() => onToggleCompare(candidate.id)}
                      >
                        <Columns2Icon className="size-3.5" />
                        {inCompare ? 'Remove from compare' : 'Add to compare'}
                      </DropdownMenuItem>
                    ) : null}
                    {onToggleRejected ? (
                      <DropdownMenuItem
                        className="whitespace-nowrap"
                        onClick={() => onToggleRejected(candidate.id)}
                      >
                        <BanIcon className="size-3.5" />
                        {candidate.rejected ? 'Undo reject' : 'Reject'}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
            <Avatar size="sm" className="border border-foreground/25">
              <AvatarFallback
                className={cn(
                  'font-semibold text-foreground',
                  candidate.rejected ? 'bg-red-200' : 'bg-foreground/15',
                )}
              >
                {initials(candidate.name)}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ScoreChip label="Application" value={candidate.applicationScore} />
          <ScoreChip label="First" value={candidate.firstRoundAverage} />
          <ScoreChip label="Final" value={candidate.finalRoundAverage} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <KanbanItem value={candidate.id} {...props}>
      {isOverlay ? (
        card
      ) : (
        <KanbanItemHandle className="block cursor-grab active:cursor-grabbing">
          {card}
        </KanbanItemHandle>
      )}
    </KanbanItem>
  );
}

interface DelibColumnProps extends Omit<ComponentProps<typeof KanbanColumn>, 'children' | 'value'> {
  value: DeliberationsColumnId;
  candidates: DeliberationsCandidate[];
  acceptLimit: number | null;
  compareIds?: Set<string>;
  isOverlay?: boolean;
  onOpenCandidate?: (candidate: DeliberationsCandidate) => void;
  onToggleRejected?: (candidateId: string) => void;
  onToggleCompare?: (candidateId: string) => void;
}

function DelibColumn({
  value,
  candidates,
  acceptLimit,
  compareIds,
  isOverlay,
  onOpenCandidate,
  onToggleRejected,
  onToggleCompare,
  ...props
}: DelibColumnProps) {
  const meta = COLUMN_META[value];
  const atCapacity =
    value === 'accept' && acceptLimit != null && candidates.length >= acceptLimit;
  const rejectedCount = candidates.filter((c) => c.rejected).length;

  return (
    <KanbanColumn value={value} disabled {...props}>
      <div
        className={cn(
          'flex h-full flex-col rounded-xl border p-2.5 shadow-sm',
          COLUMN_WELL,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-1 py-1">
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('size-2.5 shrink-0 rounded-full', meta.accent)} />
              <h2 className="truncate text-sm font-bold tracking-tight text-foreground">
                {meta.title}
              </h2>
            </div>
            <p className="text-xs text-foreground/75">{meta.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {rejectedCount > 0 ? (
              <Badge className="border-0 bg-red-600 font-semibold tabular-nums text-white">
                {rejectedCount} rejected
              </Badge>
            ) : null}
            {value === 'accept' && acceptLimit != null ? (
              <Badge
                variant={atCapacity ? 'destructive' : 'outline'}
                className={cn(
                  'font-semibold tabular-nums',
                  !atCapacity && 'border-foreground/25 bg-white text-foreground',
                )}
              >
                {candidates.length}/{acceptLimit}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-foreground/25 bg-white font-semibold tabular-nums text-foreground"
              >
                {candidates.length}
              </Badge>
            )}
            <span className="inline-flex size-6 items-center justify-center text-foreground/55">
              <GripVerticalIcon className="size-3.5" aria-hidden />
            </span>
          </div>
        </div>

        <KanbanColumnContent value={value} className="mt-2 min-h-80 gap-2.5">
          {candidates.map((candidate) => (
            <ApplicantCard
              key={candidate.id}
              candidate={candidate}
              columnId={value}
              isOverlay={isOverlay}
              inCompare={compareIds?.has(candidate.id)}
              onOpen={onOpenCandidate}
              onToggleRejected={onToggleRejected}
              onToggleCompare={onToggleCompare}
            />
          ))}
        </KanbanColumnContent>
      </div>
    </KanbanColumn>
  );
}

/** Keep non-rejected cards above rejected ones; stable within each group. */
function sinkRejectedToBottom(
  items: DeliberationsCandidate[],
): DeliberationsCandidate[] {
  const active: DeliberationsCandidate[] = [];
  const rejected: DeliberationsCandidate[] = [];
  for (const item of items) {
    if (item.rejected) rejected.push(item);
    else active.push(item);
  }
  if (rejected.length === 0) return items;
  return [...active, ...rejected];
}

function sinkRejectedInColumns(
  columns: Record<DeliberationsColumnId, DeliberationsCandidate[]>,
): Record<DeliberationsColumnId, DeliberationsCandidate[]> {
  const next = { ...columns };
  for (const columnId of Object.keys(next) as DeliberationsColumnId[]) {
    next[columnId] = sinkRejectedToBottom(next[columnId]);
  }
  return next;
}

function moveCandidateToColumnEnd(
  items: DeliberationsCandidate[],
  candidateId: string,
): DeliberationsCandidate[] {
  const index = items.findIndex((c) => c.id === candidateId);
  if (index < 0 || index === items.length - 1) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (!moved) return items;
  next.push(moved);
  return next;
}

function updateCandidateRejected(
  columns: Record<DeliberationsColumnId, DeliberationsCandidate[]>,
  candidateId: string,
  rejected: boolean,
): Record<DeliberationsColumnId, DeliberationsCandidate[]> {
  const next = { ...columns };
  for (const columnId of Object.keys(next) as DeliberationsColumnId[]) {
    let list = next[columnId].map((candidate) =>
      candidate.id === candidateId ? { ...candidate, rejected } : candidate,
    );
    // Newly rejected → very bottom of column; undo leaves position as-is.
    if (rejected) {
      list = sinkRejectedToBottom(moveCandidateToColumnEnd(list, candidateId));
    }
    next[columnId] = list;
  }
  return next;
}

export function DeliberationsKanban({
  teamId,
  initialColumns,
  initialSavedLayout = null,
  acceptLimit,
  allowOverCap = false,
  teamName,
  canSave = true,
  readOnly = false,
  selectionComplete = false,
  saveUrl,
  finalizeUrl,
  resolveDetailUrl,
  resolveBatchDetailsUrl,
  onFinalized,
}: {
  teamId: number;
  initialColumns: Record<DeliberationsColumnId, DeliberationsCandidate[]>;
  /** Last persisted layout from the server (null if never saved). */
  initialSavedLayout?: DeliberationsBoardLayout | null;
  acceptLimit: number | null;
  allowOverCap?: boolean;
  teamName: string;
  /** Admin-only: persist shared board. Non-admins can still rearrange locally. */
  canSave?: boolean;
  /** Pipeline closed / archive — no local rearranges either. */
  readOnly?: boolean;
  /** True when Accept offers are already locked. */
  selectionComplete?: boolean;
  /** PUT target when canSave. Defaults to admin deliberations route. */
  saveUrl?: string;
  /** POST target to lock final selection (admin). */
  finalizeUrl?: string;
  /** Candidate detail GET URL builder. */
  resolveDetailUrl?: (applicationId: number) => string;
  /** Batch details GET URL builder for compare. */
  resolveBatchDetailsUrl?: (applicationIds: number[]) => string;
  /** Called after a successful finalize so the parent can refresh. */
  onFinalized?: () => void;
}) {
  const boardSaveUrl = saveUrl ?? `/api/admin/teams/${teamId}/deliberations`;
  const boardFinalizeUrl =
    finalizeUrl ?? `/api/admin/teams/${teamId}/deliberations/finalize`;
  const detailUrl =
    resolveDetailUrl ??
    ((applicationId: number) =>
      `/api/admin/teams/${teamId}/deliberations/${applicationId}`);
  const batchDetailsUrl =
    resolveBatchDetailsUrl ??
    ((applicationIds: number[]) =>
      `/api/admin/teams/${teamId}/deliberations/details?ids=${applicationIds.join(',')}`);
  const [columns, setColumns] =
    useState<Record<DeliberationsColumnId, DeliberationsCandidate[]>>(initialColumns);
  // Baseline for dirty checks: last DB layout, or the applied columns on first load.
  const [savedLayout, setSavedLayout] = useState<DeliberationsBoardLayout>(
    () => initialSavedLayout ?? serializeDeliberationsLayout(initialColumns),
  );
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [locked, setLocked] = useState(selectionComplete);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  /** null = manual column order (set after a drag). */
  const [sortMetric, setSortMetric] = useState<DeliberationsSortMetric | null>(
    'everything',
  );
  const [sortDirection, setSortDirection] =
    useState<DeliberationsSortDirection>('desc');

  const displayColumns = useMemo(() => {
    if (!sortMetric) return columns;
    return sortColumnsByScore(columns, sortMetric, sortDirection);
  }, [columns, sortMetric, sortDirection]);

  const columnOrder = useMemo(
    () => Object.keys(displayColumns) as DeliberationsColumnId[],
    [displayColumns],
  );

  const allCandidates = useMemo(
    () => Object.values(columns).flat(),
    [columns],
  );

  const currentLayout = useMemo(
    () => serializeDeliberationsLayout(columns),
    [columns],
  );

  const isDirty = !layoutsEqual(currentLayout, savedLayout);

  const compareIdSet = useMemo(() => new Set(compareIds), [compareIds]);

  const selectedCandidate = useMemo(() => {
    if (!selectedId) return null;
    return allCandidates.find((candidate) => candidate.id === selectedId) ?? null;
  }, [allCandidates, selectedId]);

  const compareCandidates = useMemo(
    () =>
      compareIds
        .map((id) => allCandidates.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is DeliberationsCandidate => candidate != null),
    [allCandidates, compareIds],
  );

  const toggleRejected = (candidateId: string) => {
    if (readOnly || locked) {
      toast.error(
        readOnly
          ? 'Recruitment is closed — this board is view-only.'
          : 'Final selection is locked for this team.',
      );
      return;
    }
    setColumns((prev) => {
      const current = Object.values(prev)
        .flat()
        .find((candidate) => candidate.id === candidateId);
      if (!current) return prev;
      return updateCandidateRejected(prev, candidateId, !current.rejected);
    });
  };

  const toggleCompare = (candidateId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(candidateId)) {
        return prev.filter((id) => id !== candidateId);
      }
      if (prev.length >= COMPARE_MAX) {
        toast.error(`Compare is limited to ${COMPARE_MAX} applicants.`);
        return prev;
      }
      return [...prev, candidateId];
    });
  };

  const handleSave = async () => {
    if (!canSave || saving || !isDirty || locked) return;
    setSaving(true);
    try {
      const layout = serializeDeliberationsLayout(columns);
      const res = await fetch(boardSaveUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        layout?: DeliberationsBoardLayout;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error || 'Failed to save board.');
        return;
      }
      setSavedLayout(json.layout ?? layout);
      toast.success('Board saved.');
    } catch {
      toast.error('Network error — could not save board.');
    } finally {
      setSaving(false);
    }
  };

  const acceptCount = columns.accept?.length ?? 0;

  const handleFinalize = async () => {
    if (!canSave || finalizing || locked) return;
    setFinalizing(true);
    try {
      const layout = serializeDeliberationsLayout(columns);
      const res = await fetch(boardFinalizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        offeredCount?: number;
        rejectedCount?: number;
      };
      if (!res.ok) {
        const message = json.error || 'Failed to complete final selection.';
        toast.error(message);
        throw new Error(message);
      }
      setLocked(true);
      setSavedLayout(layout);
      toast.success(
        json.message ??
          `Final selection locked — ${json.offeredCount ?? acceptCount} offer(s).`,
      );
      onFinalized?.();
    } catch (err) {
      if (!(err instanceof Error)) {
        toast.error('Network error — could not complete final selection.');
        throw new Error('Finalize failed');
      }
      // API failures already toasted; rethrow so the confirm dialog stays open.
      if (!err.message || err.message === 'Failed to fetch') {
        toast.error('Network error — could not complete final selection.');
      }
      throw err;
    } finally {
      setFinalizing(false);
    }
  };

  const handleMove = ({
    activeContainer,
    activeIndex,
    overContainer,
    overIndex,
  }: KanbanMoveEvent) => {
    if (readOnly) {
      toast.error('Recruitment is closed — this board is view-only.');
      return;
    }
    if (locked) {
      toast.error('Final selection is locked for this team.');
      return;
    }
    const from = activeContainer as DeliberationsColumnId;
    const to = overContainer as DeliberationsColumnId;
    // Indices refer to the Kanban value (displayColumns when sort is active).
    const sourceItems = displayColumns[from] ?? [];
    const destItems = from === to ? sourceItems : (displayColumns[to] ?? []);
    if (activeIndex < 0 || activeIndex >= sourceItems.length) return;

    if (from === to) {
      if (activeIndex === overIndex) return;
      setColumns(
        sinkRejectedInColumns({
          ...displayColumns,
          [from]: arrayMove(sourceItems, activeIndex, overIndex),
        }),
      );
      setSortMetric(null);
      return;
    }

    const movingIntoAccept = to === 'accept' && from !== 'accept';
    if (
      movingIntoAccept &&
      acceptLimit != null &&
      !allowOverCap &&
      destItems.length >= acceptLimit
    ) {
      toast.error(`Accept is full — offer limit is ${acceptLimit} for ${teamName}.`);
      return;
    }

    const nextSource = [...sourceItems];
    const [moved] = nextSource.splice(activeIndex, 1);
    if (!moved) return;

    const nextDest = [...destItems];
    const insertAt = Math.max(0, Math.min(overIndex, nextDest.length));
    nextDest.splice(insertAt, 0, moved);

    setColumns(
      sinkRejectedInColumns({
        ...displayColumns,
        [from]: nextSource,
        [to]: nextDest,
      }),
    );
    setSortMetric(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Sort by</span>
          <ToggleGroup
            value={sortMetric ? [sortMetric] : []}
            onValueChange={(values) => {
              const next = values[0] as DeliberationsSortMetric | undefined;
              if (next) setSortMetric(next);
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Sort score metric"
          >
            {DELIBERATIONS_SORT_METRICS.map((metric) => (
              <ToggleGroupItem key={metric.value} value={metric.value}>
                {metric.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!sortMetric}
            onClick={() =>
              setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
            }
            aria-label={
              sortDirection === 'desc'
                ? 'Sort high to low'
                : 'Sort low to high'
            }
          >
            {sortDirection === 'desc' ? (
              <ArrowDownWideNarrowIcon className="size-3.5" />
            ) : (
              <ArrowUpNarrowWideIcon className="size-3.5" />
            )}
            {sortDirection === 'desc' ? 'High → low' : 'Low → high'}
          </Button>
          {!sortMetric ? (
            <Badge
              variant="outline"
              className="border-foreground/25 bg-white text-foreground"
            >
              Manual order
            </Badge>
          ) : null}
        </div>
        {canSave ? (
          <>
            {locked ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-700"
              >
                Final selection locked
              </Badge>
            ) : null}
            {isDirty && !locked ? (
              <p className="text-sm text-muted-foreground">Unsaved changes</p>
            ) : null}
            <LoadingButton
              type="button"
              onClick={handleSave}
              loading={saving}
              disabled={!isDirty || locked}
            >
              Save
            </LoadingButton>
            {!locked ? (
              <>
                <LoadingButton
                  type="button"
                  variant="primary"
                  loading={finalizing}
                  disabled={acceptCount === 0 || finalizing}
                  onClick={() => setFinalizeOpen(true)}
                >
                  Complete final selection
                </LoadingButton>
                <DestructiveConfirmDialog
                  open={finalizeOpen}
                  onOpenChange={setFinalizeOpen}
                  title={`Complete final selection for ${teamName}?`}
                  description={
                    <>
                      This locks <strong>{acceptCount}</strong> offer
                      {acceptCount === 1 ? '' : 's'} from Accept and marks everyone
                      else on this board as not selected.
                    </>
                  }
                  confirmLabel="Lock final selection"
                  onConfirm={handleFinalize}
                />
              </>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Local preview — admin saves &amp; advances
          </p>
        )}
      </div>

      <ApplicantCompareBar
        count={compareIds.length}
        onCompare={() => setCompareOpen(true)}
        onClear={() => {
          setCompareIds([]);
          setCompareOpen(false);
        }}
      />

      <div className="overflow-x-auto">
        <Kanban
          value={displayColumns}
          onValueChange={(value) => {
            setColumns(
              sinkRejectedInColumns(
                value as Record<DeliberationsColumnId, DeliberationsCandidate[]>,
              ),
            );
            setSortMetric(null);
          }}
          getItemValue={(item) => item.id}
          onMove={handleMove}
          className="w-full"
        >
          <KanbanBoard className="grid auto-rows-fr grid-cols-[repeat(3,minmax(16rem,1fr))] gap-3">
            {columnOrder.map((columnId) => (
              <DelibColumn
                key={columnId}
                value={columnId}
                candidates={displayColumns[columnId] ?? []}
                acceptLimit={acceptLimit}
                compareIds={compareIdSet}
                onOpenCandidate={(candidate) => setSelectedId(candidate.id)}
                onToggleRejected={toggleRejected}
                onToggleCompare={toggleCompare}
              />
            ))}
          </KanbanBoard>
          <KanbanOverlay>
            {({ value, variant }) => {
              const activeValue = String(value);
              if (variant === 'column') {
                const columnId = activeValue as DeliberationsColumnId;
                return (
                  <DelibColumn
                    value={columnId}
                    candidates={displayColumns[columnId] ?? []}
                    acceptLimit={acceptLimit}
                    isOverlay
                  />
                );
              }
              const candidate = allCandidates.find((item) => item.id === activeValue);
              if (!candidate) return null;
              const columnId =
                (Object.keys(displayColumns) as DeliberationsColumnId[]).find((id) =>
                  displayColumns[id].some((item) => item.id === activeValue),
                ) ?? 'pool';
              return (
                <ApplicantCard candidate={candidate} columnId={columnId} isOverlay />
              );
            }}
          </KanbanOverlay>
        </Kanban>

        <Sheet
          open={selectedCandidate != null}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        >
          <SheetContent side="right" size="lg" className="overflow-y-auto">
            {selectedCandidate ? (
              <>
                <SheetHeader>
                  <SheetTitle>{selectedCandidate.name}</SheetTitle>
                  <SheetDescription className="sr-only">
                    Applicant detail for {selectedCandidate.name}, row{' '}
                    {displayApplicantId(selectedCandidate.rowIndex)}, {teamName}
                    {selectedCandidate.rejected ? ', rejected' : ''}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-wrap gap-2 px-4">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const already = compareIdSet.has(selectedCandidate.id)
                      if (!already && compareIds.length >= COMPARE_MAX) {
                        toast.error(`Compare is limited to ${COMPARE_MAX} applicants.`)
                        return
                      }
                      toggleCompare(selectedCandidate.id)
                      toast.success(
                        already
                          ? `Removed ${selectedCandidate.name} from compare`
                          : `Added ${selectedCandidate.name} to compare`,
                      )
                    }}
                  >
                    <Columns2Icon className="size-3.5" />
                    {compareIdSet.has(selectedCandidate.id)
                      ? 'Remove from compare'
                      : 'Add to compare'}
                  </Button>
                </div>
                <DeliberationsCandidateDetailPanel
                  teamId={teamId}
                  teamName={teamName}
                  applicationId={selectedCandidate.applicationId}
                  rejected={selectedCandidate.rejected}
                  onToggleRejected={() => toggleRejected(selectedCandidate.id)}
                  detailUrl={detailUrl(selectedCandidate.applicationId)}
                />
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>

      <ApplicantCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        teamId={teamId}
        teamName={teamName}
        candidates={compareCandidates}
        resolveDetailUrl={detailUrl}
        resolveBatchDetailsUrl={batchDetailsUrl}
        onToggleRejected={toggleRejected}
        onRemove={(candidateId) => {
          setCompareIds((prev) => {
            const next = prev.filter((id) => id !== candidateId);
            if (next.length === 0) setCompareOpen(false);
            return next;
          });
        }}
      />
    </div>
  );
}
