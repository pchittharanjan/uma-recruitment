'use client';

import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  BanIcon,
  Columns2Icon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  Settings2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApplicantCompareBar,
  ApplicantCompareDialog,
} from '@/components/applicant-compare';
import { prefetchDeliberationsDetail } from '@/components/deliberations-candidate-detail';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { GoOverCapDialog } from '@/components/go-over-cap-dialog';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanMoveEvent,
} from '@/components/ui/kanban';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useOptionalWorkspace } from '@/components/workspace-provider';
import { deliberationsApplicantHref } from '@/lib/deliberations-paths';
import { useRouter } from 'next/navigation';

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
    description: 'All Final Round Candidates',
    card: 'border-sky-300 bg-sky-100 text-foreground',
  },
  considering: {
    title: 'Considering',
    accent: 'bg-amber-600',
    description: 'Candidates under discussion',
    card: 'border-amber-300 bg-amber-100 text-foreground',
  },
  accept: {
    title: 'Accept',
    accent: 'bg-green-600',
    description: 'Candidates to offer',
    card: 'border-green-300 bg-green-100 text-foreground',
  },
};

const REJECTED_CARD =
  'border-red-400 bg-red-100 text-foreground';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function parseCapInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function AcceptCapBadge({
  count,
  acceptLimit,
  overCapExtra,
  canEdit,
  canRequestOverCap,
  teamId,
  readOnly,
  onSaved,
  onOverCapExtraSaved,
}: {
  count: number;
  acceptLimit: number | null;
  overCapExtra: number;
  canEdit: boolean;
  canRequestOverCap: boolean;
  teamId: number;
  readOnly: boolean;
  onSaved: (cap: number | null) => void;
  onOverCapExtraSaved: (extra: number) => void;
}) {
  const effectiveMax =
    acceptLimit == null ? null : acceptLimit + Math.max(0, overCapExtra);
  const atCapacity = effectiveMax != null && count >= effectiveMax;
  const [open, setOpen] = useState(false);
  const [goOverOpen, setGoOverOpen] = useState(false);
  const [draftCap, setDraftCap] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftCap(acceptLimit === null ? '' : String(acceptLimit));
  }, [open, acceptLimit]);

  const badgeLabel =
    acceptLimit != null
      ? overCapExtra > 0
        ? `${count}/${acceptLimit} +${overCapExtra}`
        : `${count}/${acceptLimit}`
      : String(count);

  const badge = (
    <Badge
      variant={atCapacity ? 'destructive' : 'outline'}
      className={cn(
        'font-semibold tabular-nums',
        !atCapacity && 'border-foreground/25 bg-white text-foreground',
      )}
    >
      {badgeLabel}
    </Badge>
  );

  const goOverControl =
    canRequestOverCap && !readOnly && acceptLimit != null ? (
      <>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 px-1.5 text-[0.7rem] text-muted-foreground"
          data-tour="deliberations-over-cap"
          onClick={() => setGoOverOpen(true)}
        >
          Go over limit
        </Button>
        <GoOverCapDialog
          open={goOverOpen}
          onOpenChange={setGoOverOpen}
          teamId={teamId}
          stage="deliberations"
          officialCap={acceptLimit}
          currentExtra={overCapExtra}
          onSuccess={onOverCapExtraSaved}
        />
      </>
    ) : null;

  if (!canEdit || readOnly) {
    return (
      <div data-tour="deliberations-cap" className="flex items-center gap-0.5">
        {badge}
        {goOverControl}
      </div>
    );
  }

  const handleSave = async () => {
    const cap = parseCapInput(draftCap);
    if (draftCap.trim() && cap === null) {
      toast.error('Offer limit must be a positive whole number, or leave blank for no limit.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/advancement-caps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          deliberationsCap: cap,
        }),
      });
      const json = (await res.json()) as {
        team?: { deliberationsCap?: number | null };
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error || 'Failed to save offer limit.');
        return;
      }
      onSaved(json.team?.deliberationsCap ?? cap);
      toast.success('Offer limit saved.');
      setOpen(false);
    } catch {
      toast.error('Network error: could not save offer limit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-tour="deliberations-cap" className="flex items-center gap-0.5">
      {badge}
      {goOverControl}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-foreground/70 hover:text-foreground"
              aria-label="Edit offer limit"
            />
          }
        >
          <Settings2Icon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 space-y-3 p-3"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`accept-cap-${teamId}`} className="text-xs font-medium">
              Offer limit
            </Label>
            <Input
              id={`accept-cap-${teamId}`}
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="No limit"
              className="h-8"
              value={draftCap}
              onChange={(e) => setDraftCap(e.target.value)}
            />
            <p className="text-[0.7rem] leading-snug text-muted-foreground">
              Blank = no cap on Accept. Set a number to show the slot count (e.g. 0/6).
              {overCapExtra > 0 ? ` Directors currently have +${overCapExtra} extra.` : ''}
            </p>
          </div>
          <LoadingButton
            type="button"
            size="sm"
            className="w-full"
            loading={saving}
            onClick={handleSave}
          >
            Save limit
          </LoadingButton>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
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
  onPrefetch?: (candidate: DeliberationsCandidate) => void;
  onToggleRejected?: (candidateId: string) => void;
  onToggleCompare?: (candidateId: string) => void;
}

function ApplicantCard({
  candidate,
  columnId,
  isOverlay,
  inCompare,
  onOpen,
  onPrefetch,
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
      data-tour={isOverlay ? undefined : 'deliberations-card'}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onMouseEnter={() => {
        if (!isOverlay) onPrefetch?.(candidate);
      }}
      onFocus={() => {
        if (!isOverlay) onPrefetch?.(candidate);
      }}
      className={cn(
        'overflow-hidden border ring-0 transition-colors',
        candidate.rejected ? REJECTED_CARD : meta.card,
        !isOverlay && 'cursor-pointer hover:border-foreground/15',
        isOverlay && 'ring-2 ring-primary/25',
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
  overCapExtra?: number;
  teamId?: number;
  canEditAcceptCap?: boolean;
  canRequestOverCap?: boolean;
  readOnly?: boolean;
  onAcceptCapSaved?: (cap: number | null) => void;
  onOverCapExtraSaved?: (extra: number) => void;
  compareIds?: Set<string>;
  isOverlay?: boolean;
  onOpenCandidate?: (candidate: DeliberationsCandidate) => void;
  onPrefetchCandidate?: (candidate: DeliberationsCandidate) => void;
  onToggleRejected?: (candidateId: string) => void;
  onToggleCompare?: (candidateId: string) => void;
}

function DelibColumn({
  value,
  candidates,
  acceptLimit,
  overCapExtra = 0,
  teamId,
  canEditAcceptCap = false,
  canRequestOverCap = false,
  readOnly = false,
  onAcceptCapSaved,
  onOverCapExtraSaved,
  compareIds,
  isOverlay,
  onOpenCandidate,
  onPrefetchCandidate,
  onToggleRejected,
  onToggleCompare,
  ...props
}: DelibColumnProps) {
  const meta = COLUMN_META[value];
  const rejectedCount = candidates.filter((c) => c.rejected).length;

  return (
    <KanbanColumn value={value} disabled {...props}>
      <div
        className={cn(
          'flex h-full flex-col rounded-xl border p-2.5',
          COLUMN_WELL,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5 px-1 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('size-2.5 shrink-0 rounded-full', meta.accent)} />
            <h2 className="text-sm font-bold leading-snug tracking-tight text-foreground">
              {meta.title}
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {rejectedCount > 0 ? (
              <Badge className="border-0 bg-red-600 font-semibold tabular-nums text-white">
                {rejectedCount} rejected
              </Badge>
            ) : null}
            {value === 'accept' ? (
              <AcceptCapBadge
                count={candidates.length}
                acceptLimit={acceptLimit}
                overCapExtra={overCapExtra}
                canEdit={canEditAcceptCap && teamId != null}
                canRequestOverCap={canRequestOverCap && teamId != null}
                teamId={teamId ?? 0}
                readOnly={readOnly}
                onSaved={(cap) => onAcceptCapSaved?.(cap)}
                onOverCapExtraSaved={(extra) => onOverCapExtraSaved?.(extra)}
              />
            ) : (
              <Badge
                variant="outline"
                className="border-foreground/25 bg-white font-semibold tabular-nums text-foreground"
              >
                {candidates.length}
              </Badge>
            )}
            <KanbanColumnHandle className="inline-flex size-6 items-center justify-center text-foreground/55 opacity-100">
              <GripVerticalIcon className="size-3.5" aria-hidden />
            </KanbanColumnHandle>
          </div>
          <p className="w-full min-w-0 text-pretty text-xs leading-snug text-foreground/75">
            {meta.description}
          </p>
        </div>

        <KanbanColumnContent value={value} className="mt-2 min-h-80 gap-2.5">
          {candidates.length === 0 && value === 'pool' ? (
            <div className="mx-1 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-foreground/20 bg-muted/30 px-3 py-8">
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                No candidates in this phase yet
              </p>
            </div>
          ) : null}
          {candidates.map((candidate) => (
            <ApplicantCard
              key={candidate.id}
              candidate={candidate}
              columnId={value}
              isOverlay={isOverlay}
              inCompare={compareIds?.has(candidate.id)}
              onOpen={onOpenCandidate}
              onPrefetch={onPrefetchCandidate}
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
  acceptLimit: initialAcceptLimit,
  overCapExtra: initialOverCapExtra = 0,
  teamName,
  canSave = true,
  canEditAcceptCap = false,
  canRequestOverCap = false,
  canFinalize,
  readOnly = false,
  selectionComplete = false,
  saveUrl,
  finalizeUrl,
  autosave = false,
  resolveDetailUrl,
  resolveBatchDetailsUrl,
  resolveApplicantPageHref,
  onFinalized,
}: {
  teamId: number;
  initialColumns: Record<DeliberationsColumnId, DeliberationsCandidate[]>;
  /** Last persisted layout from the server (null if never saved). */
  initialSavedLayout?: DeliberationsBoardLayout | null;
  acceptLimit: number | null;
  overCapExtra?: number;
  teamName: string;
  /** Admin-only: persist shared board. Non-admins can still rearrange locally. */
  canSave?: boolean;
  /** Admin-only: edit Accept offer limit from the board. Defaults to canSave. */
  canEditAcceptCap?: boolean;
  /** Team portal: enter go-over code to raise Accept extra. */
  canRequestOverCap?: boolean;
  /** Admin-only: lock Accept → offers. Hidden during phase preview. Defaults to canSave. */
  canFinalize?: boolean;
  /** Pipeline closed / archive — no local rearranges either. */
  readOnly?: boolean;
  /** True when Accept offers are already locked. */
  selectionComplete?: boolean;
  /** PUT target when canSave. Defaults to admin deliberations route. */
  saveUrl?: string;
  /** POST target to lock final selection (admin). */
  finalizeUrl?: string;
  /** Debounced autosave on layout changes (team personal boards). */
  autosave?: boolean;
  /** Candidate detail GET URL builder. */
  resolveDetailUrl?: (applicationId: number) => string;
  /** Batch details GET URL builder for compare. */
  resolveBatchDetailsUrl?: (applicationIds: number[]) => string;
  /** Full-page applicant view (opens as an in-app workspace tab). */
  resolveApplicantPageHref?: (applicationId: number, name?: string) => string;
  /** Called after a successful finalize so the parent can refresh. */
  onFinalized?: () => void;
}) {
  const router = useRouter();
  const workspace = useOptionalWorkspace();
  const boardSaveUrl = saveUrl ?? `/api/admin/teams/${teamId}/deliberations`;
  const boardFinalizeUrl =
    finalizeUrl ?? `/api/admin/teams/${teamId}/deliberations/finalize`;
  const allowFinalize = canFinalize ?? canSave;
  const effectiveCanEditAcceptCap = canEditAcceptCap ?? canSave;
  const [acceptLimit, setAcceptLimit] = useState(initialAcceptLimit);
  const [overCapExtra, setOverCapExtra] = useState(initialOverCapExtra);

  useEffect(() => {
    setAcceptLimit(initialAcceptLimit);
    setOverCapExtra(initialOverCapExtra);
  }, [initialAcceptLimit, initialOverCapExtra]);
  const detailUrl =
    resolveDetailUrl ??
    ((applicationId: number) =>
      `/api/admin/teams/${teamId}/deliberations/${applicationId}`);
  const batchDetailsUrl =
    resolveBatchDetailsUrl ??
    ((applicationIds: number[]) =>
      `/api/admin/teams/${teamId}/deliberations/details?ids=${applicationIds.join(',')}`);
  const applicantPageHref =
    resolveApplicantPageHref ??
    ((applicationId: number, name?: string) =>
      deliberationsApplicantHref(teamId, applicationId, 'admin', { name }));
  const [columns, setColumns] =
    useState<Record<DeliberationsColumnId, DeliberationsCandidate[]>>(initialColumns);
  // Baseline for dirty checks: last DB layout, or the applied columns on first load.
  const [savedLayout, setSavedLayout] = useState<DeliberationsBoardLayout>(
    () => initialSavedLayout ?? serializeDeliberationsLayout(initialColumns),
  );
  const [saving, setSaving] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'pending' | 'saved' | 'error'>(
    'idle',
  );
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [locked, setLocked] = useState(selectionComplete);
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

  const compareCandidates = useMemo(
    () =>
      compareIds
        .map((id) => allCandidates.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is DeliberationsCandidate => candidate != null),
    [allCandidates, compareIds],
  );

  const viewOnlyMessage =
    readOnly && !canSave
      ? 'Discussion view only — an Admin saves the official board.'
      : 'Recruitment is closed. This board is view-only.';

  const persistLayout = async (options?: { silent?: boolean }) => {
    if (!canSave || saving || !isDirty || locked) return false;
    setSaving(true);
    if (autosave) setAutosaveState('pending');
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
        if (autosave) setAutosaveState('error');
        if (!options?.silent) {
          toast.error(json.error || 'Failed to save board.');
        }
        return false;
      }
      setSavedLayout(json.layout ?? layout);
      if (autosave) {
        setAutosaveState('saved');
      } else if (!options?.silent) {
        toast.success('Board saved.');
      }
      return true;
    } catch {
      if (autosave) setAutosaveState('error');
      if (!options?.silent) {
        toast.error('Network error: could not save board.');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!autosave || !canSave || locked || readOnly || !isDirty) return;
    setAutosaveState('pending');
    const timer = window.setTimeout(() => {
      void persistLayout({ silent: true });
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist when layout changes
  }, [autosave, canSave, locked, readOnly, isDirty, currentLayout]);

  const toggleRejected = (candidateId: string) => {
    if (readOnly || locked) {
      toast.error(
        readOnly
          ? viewOnlyMessage
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
    await persistLayout();
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
          `Final selection locked: ${json.offeredCount ?? acceptCount} offer(s).`,
      );
      onFinalized?.();
    } catch (err) {
      if (!(err instanceof Error)) {
        toast.error('Network error: could not complete final selection.');
        throw new Error('Finalize failed');
      }
      // API failures already toasted; rethrow so the confirm dialog stays open.
      if (!err.message || err.message === 'Failed to fetch') {
        toast.error('Network error: could not complete final selection.');
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
      toast.error(viewOnlyMessage);
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
    const acceptMax =
      acceptLimit == null ? null : acceptLimit + Math.max(0, overCapExtra);
    if (
      movingIntoAccept &&
      acceptMax != null &&
      destItems.length >= acceptMax
    ) {
      toast.error(
        overCapExtra > 0
          ? `Accept is full: offer limit is ${acceptLimit} + ${overCapExtra} extra for ${teamName}.`
          : `Accept is full: offer limit is ${acceptLimit} for ${teamName}.`,
      );
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
      {canSave && isDirty && !locked && !autosave ? (
        <StatusBanner
          type="warning"
          message="You have unsaved board changes. Click Save before leaving so the team sees the latest layout."
        />
      ) : null}
      <div className="display-panel flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          data-tour="deliberations-sort"
        >
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
                Final Selection Locked
              </Badge>
            ) : null}
            {autosave ? (
              <p className="text-sm text-muted-foreground">
                {autosaveState === 'pending' || (isDirty && autosaveState !== 'error')
                  ? 'Saving…'
                  : autosaveState === 'error'
                    ? 'Autosave failed — retry by moving a card'
                    : 'Autosaved'}
              </p>
            ) : isDirty && !locked ? (
              <p className="text-sm text-muted-foreground">Unsaved changes</p>
            ) : null}
            {!autosave ? (
              <LoadingButton
                type="button"
                onClick={handleSave}
                loading={saving}
                disabled={!isDirty || locked}
                data-tour="deliberations-save"
              >
                Save
              </LoadingButton>
            ) : null}
            {!locked && allowFinalize ? (
              <>
                <LoadingButton
                  type="button"
                  variant="primary"
                  loading={finalizing}
                  disabled={acceptCount === 0 || finalizing}
                  onClick={() => setFinalizeOpen(true)}
                  data-tour="deliberations-finalize"
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
                  confirmLabel="Lock Final Selection"
                  onConfirm={handleFinalize}
                />
              </>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Follow the admin screen for official placements.
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

      <div
        data-tour="deliberations-board"
        className="overflow-x-auto overscroll-x-contain"
      >
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
          <KanbanBoard className="grid w-max min-w-full auto-rows-fr grid-cols-[repeat(3,minmax(18rem,1fr))] gap-3">
            {columnOrder.map((columnId) => (
              <DelibColumn
                key={columnId}
                value={columnId}
                candidates={displayColumns[columnId] ?? []}
                acceptLimit={acceptLimit}
                overCapExtra={overCapExtra}
                teamId={teamId}
                canEditAcceptCap={effectiveCanEditAcceptCap}
                canRequestOverCap={canRequestOverCap}
                readOnly={readOnly}
                onAcceptCapSaved={(cap) => {
                  setAcceptLimit(cap);
                }}
                onOverCapExtraSaved={(extra) => {
                  setOverCapExtra(extra);
                }}
                compareIds={compareIdSet}
                onOpenCandidate={(candidate) => {
                  const href = applicantPageHref(
                    candidate.applicationId,
                    candidate.name,
                  );
                  if (workspace) {
                    workspace.openTab(href);
                    return;
                  }
                  router.push(href);
                }}
                onPrefetchCandidate={(candidate) =>
                  prefetchDeliberationsDetail(detailUrl(candidate.applicationId))
                }
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
                    overCapExtra={overCapExtra}
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
