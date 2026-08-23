'use client';

import { useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import { PageHeader, PageSection } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AssignmentWorkStatus, LoadSummary } from '@/lib/assignments';

interface AssignmentEntry {
  assignmentId: number;
  applicationId: number;
  rowIndex: number;
  applicantNumber: number;
  candidateName: string;
  candidateEmail: string;
  status: AssignmentWorkStatus;
  hasScores: boolean;
}

interface GraderData {
  id: number;
  name: string;
  email: string;
  total: number;
  completed: number;
  movable: number;
  assignments: AssignmentEntry[];
}

export interface AssignmentReviewData {
  team: { id: number; name: string };
  graders: GraderData[];
  load: LoadSummary | null;
}

interface ReassignDraft {
  assignmentId: number;
  applicationId: number;
  fromGraderId: number;
  fromGraderName: string;
  appLabel: string;
  hasScores: boolean;
}

interface MoveDraft {
  fromGraderId: number;
  fromGraderName: string;
  movable: number;
  inProgress: number;
}

function eligibleGraders(
  graders: GraderData[],
  applicationId: number,
  fromGraderId: number,
): GraderData[] {
  const assignedUserIds = new Set<number>();
  for (const grader of graders) {
    for (const assignment of grader.assignments) {
      if (assignment.applicationId === applicationId) {
        assignedUserIds.add(grader.id);
      }
    }
  }
  return graders.filter((g) => g.id !== fromGraderId && !assignedUserIds.has(g.id));
}

function matchesQuery(assignment: AssignmentEntry, query: string): boolean {
  if (!query) return true;
  return (
    assignment.candidateName.toLowerCase().includes(query) ||
    assignment.candidateEmail.toLowerCase().includes(query) ||
    String(assignment.applicantNumber).includes(query) ||
    `#${assignment.applicantNumber}`.includes(query)
  );
}

function appLabel(assignment: AssignmentEntry): string {
  return `${assignment.candidateName} · #${assignment.applicantNumber}`;
}

export function AdminAssignmentReview({
  teamId,
  initialData,
}: {
  teamId: string;
  initialData: AssignmentReviewData;
}) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState('');
  const [loadDrafts, setLoadDrafts] = useState<Record<number, string>>({});
  const [savingLoadFor, setSavingLoadFor] = useState<number | null>(null);
  const [rebalancing, setRebalancing] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [reassignDraft, setReassignDraft] = useState<ReassignDraft | null>(null);
  const [newUserId, setNewUserId] = useState<number | null>(null);
  const [reassignError, setReassignError] = useState('');
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [moveToIds, setMoveToIds] = useState<number[]>([]);
  const [moveCount, setMoveCount] = useState('1');
  const [moveIncludeInProgress, setMoveIncludeInProgress] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');

  const refresh = async () => {
    const res = await fetch(`/api/admin/teams/${teamId}/assignments`);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? 'Failed to reload assignments.');
    }
    setData(json);
  };

  const query = search.trim().toLowerCase();
  const load = data.load;

  const assignedGraders = useMemo(
    () => data.graders.filter((g) => g.total > 0),
    [data.graders],
  );

  const moveCapacity = moveDraft
    ? moveDraft.movable + (moveIncludeInProgress ? moveDraft.inProgress : 0)
    : 0;

  const moveRecipients = useMemo(() => {
    if (!moveDraft) return [];
    return data.graders.filter((g) => g.id !== moveDraft.fromGraderId);
  }, [data.graders, moveDraft]);

  const reassignOptions = useMemo(() => {
    if (!reassignDraft) return [];
    return eligibleGraders(data.graders, reassignDraft.applicationId, reassignDraft.fromGraderId);
  }, [data.graders, reassignDraft]);

  const matchingAssignmentIds = useMemo(() => {
    if (!query) return null;
    const ids = new Set<number>();
    for (const grader of data.graders) {
      for (const assignment of grader.assignments) {
        if (matchesQuery(assignment, query)) ids.add(assignment.assignmentId);
      }
    }
    return ids;
  }, [data.graders, query]);

  const postAdjust = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/teams/${teamId}/assignments/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? 'Could not update assignments.');
    }
    return json as { moved?: number };
  };

  const handleRebalance = async () => {
    setRebalancing(true);
    setError('');
    setSuccessMsg('');
    try {
      const json = await postAdjust({ action: 'rebalance' });
      const moved = json.moved ?? 0;
      const message =
        moved === 0
          ? 'Loads are already as even as they can be.'
          : `Moved ${moved} application${moved === 1 ? '' : 's'} so counts are even.`;
      setSuccessMsg(message);
      toast.success(message);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not even out loads.';
      setError(message);
      toast.error(message);
    } finally {
      setRebalancing(false);
    }
  };

  const handleSetLoad = async (grader: GraderData) => {
    const raw = loadDrafts[grader.id] ?? String(grader.total);
    const target = Number.parseInt(raw, 10);
    if (!Number.isInteger(target) || target < 0) {
      const message = 'Enter a whole number of 0 or more.';
      setError(message);
      toast.error(message);
      return;
    }
    if (target === grader.total) return;

    setSavingLoadFor(grader.id);
    setError('');
    setSuccessMsg('');
    try {
      const json = await postAdjust({ action: 'set_load', userId: grader.id, target });
      const moved = json.moved ?? 0;
      const message = `Updated ${grader.name} to ${target} (moved ${moved}).`;
      setSuccessMsg(message);
      toast.success(message);
      setLoadDrafts((prev) => {
        const next = { ...prev };
        delete next[grader.id];
        return next;
      });
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not update that grader’s load.';
      setError(message);
      toast.error(message);
    } finally {
      setSavingLoadFor(null);
    }
  };

  const openReassign = (assignment: AssignmentEntry, grader: GraderData) => {
    const options = eligibleGraders(data.graders, assignment.applicationId, grader.id);
    setReassignDraft({
      assignmentId: assignment.assignmentId,
      applicationId: assignment.applicationId,
      fromGraderId: grader.id,
      fromGraderName: grader.name,
      appLabel: appLabel(assignment),
      hasScores: assignment.hasScores,
    });
    setNewUserId(options[0]?.id ?? null);
    setReassignError('');
  };

  const handleReassignConfirm = async () => {
    if (!reassignDraft || newUserId === null) {
      setReassignError('Select a grader.');
      return;
    }

    setReassigning(true);
    setReassignError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/assignments/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: reassignDraft.assignmentId,
          newUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Reassign failed.';
        setReassignError(message);
        toast.error(message);
        return;
      }
      const message = `Reassigned to ${json.newGraderName}`;
      setSuccessMsg(message);
      toast.success(message);
      setReassignDraft(null);
      await refresh();
    } catch {
      setReassignError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  const openMoveRemaining = (grader: GraderData) => {
    const inProgress = grader.assignments.filter(
      (a) => a.status === 'pending' && a.hasScores,
    ).length;
    setMoveDraft({
      fromGraderId: grader.id,
      fromGraderName: grader.name,
      movable: grader.movable,
      inProgress,
    });
    const others = data.graders.filter((g) => g.id !== grader.id);
    const fewest = others.length > 0 ? Math.min(...others.map((g) => g.total)) : 0;
    const defaults = others.filter((g) => g.total === fewest).map((g) => g.id);
    setMoveToIds(defaults.length > 0 ? defaults : others.slice(0, 1).map((g) => g.id));
    setMoveCount(String(grader.movable));
    setMoveIncludeInProgress(false);
    setMoveError('');
  };

  const toggleMoveRecipient = (userId: number, checked: boolean) => {
    setMoveToIds((prev) => {
      if (checked) return prev.includes(userId) ? prev : [...prev, userId];
      return prev.filter((id) => id !== userId);
    });
  };

  const handleMoveRemaining = async () => {
    if (!moveDraft) return;
    const count = Number.parseInt(moveCount, 10);
    if (!Number.isInteger(count) || count < 1) {
      setMoveError('Enter how many applications to move.');
      return;
    }
    if (moveToIds.length === 0) {
      setMoveError('Pick at least one person to assign to.');
      return;
    }

    setMoving(true);
    setMoveError('');
    setSuccessMsg('');
    try {
      const json = await postAdjust({
        action: 'move_remaining',
        fromUserId: moveDraft.fromGraderId,
        toUserIds: moveToIds,
        count,
        includeInProgress: moveIncludeInProgress,
      });
      const moved = json.moved ?? 0;
      const message = `Moved ${moved} application${moved === 1 ? '' : 's'} from ${moveDraft.fromGraderName}.`;
      setSuccessMsg(message);
      toast.success(message);
      setMoveDraft(null);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not move applications.';
      setMoveError(message);
      toast.error(message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <PageSection>
      <PageHeader
        eyebrow={data.team.name}
        title="Review grader assignments"
        description="Anytime after import — including during grading — you can even out counts, give someone fewer apps, or move leftover apps to specific people if a grader has an emergency or is going slowly. Names are visible here for admins only; graders still see applicant numbers."
        actions={
          load?.rebalanceable ? (
            <LoadingButton
              onClick={handleRebalance}
              loading={rebalancing}
              data-tour="assignments-actions"
            >
              Even out loads
            </LoadingButton>
          ) : null
        }
      />

      {successMsg && <StatusBanner message={successMsg} type="success" />}
      {error && <StatusBanner message={error} type="error" />}

      {data.graders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No application assignments yet. Import a spreadsheet first, then come back here to review
          who got whom.
        </p>
      ) : null}

      {load?.rebalanceable && (
        <StatusBanner
          type="info"
          message={`Counts are uneven (${load.min}–${load.max}). Even them out so most people are at ${load.evenLow === load.evenHigh ? load.evenLow : `${load.evenLow} or ${load.evenHigh}`}. Anyone you already reduced stays reduced.`}
        />
      )}

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a name or applicant # (for conflicts)"
          className="pl-8"
          aria-label="Search applicant name or number"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {assignedGraders.map((g) => {
          const off = load?.uneven && (g.total === load.min || g.total === load.max);
          const left = g.total - g.completed;
          return (
            <Card key={g.id} className={cn('gap-1 p-4 text-center', off && 'border-amber-300/80')}>
              <p className="truncate text-sm font-medium">{g.name}</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{g.total}</p>
              <p className="text-sm text-muted-foreground">assignments</p>
              {g.completed > 0 && (
                <p className="text-sm text-emerald-700">
                  {g.completed} done{left > 0 ? ` · ${left} left` : ''}
                </p>
              )}
              {g.completed === 0 && left > 0 && (
                <p className="text-sm text-muted-foreground">{left} left</p>
              )}
            </Card>
          );
        })}
      </div>

      <div
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        data-tour="assignments-table"
      >
        {assignedGraders.map((grader) => {
          const visibleAssignments = query
            ? grader.assignments.filter((a) => matchingAssignmentIds?.has(a.assignmentId))
            : grader.assignments;
          if (query && visibleAssignments.length === 0) return null;

          const draft = loadDrafts[grader.id] ?? String(grader.total);
          const draftNumber = Number.parseInt(draft, 10);
          const draftChanged = Number.isInteger(draftNumber) && draftNumber !== grader.total;

          return (
            <Card key={grader.id} className="overflow-hidden">
              <div className="space-y-3 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{grader.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{grader.email}</p>
                  </div>
                  <StageBadge label={`${grader.total} apps`} color="blue" size="compact" />
                </div>
                <div className="flex items-end gap-2" data-tour="assignments-actions">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`load-${grader.id}`} className="text-xs">
                      Set load (fewer if they have less time)
                    </Label>
                    <Input
                      id={`load-${grader.id}`}
                      type="number"
                      min={grader.completed}
                      max={grader.total + 20}
                      value={draft}
                      onChange={(e) =>
                        setLoadDrafts((prev) => ({ ...prev, [grader.id]: e.target.value }))
                      }
                      className="h-8"
                    />
                  </div>
                  <LoadingButton
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={!draftChanged}
                    loading={savingLoadFor === grader.id}
                    onClick={() => handleSetLoad(grader)}
                  >
                    Update
                  </LoadingButton>
                </div>
                {grader.total - grader.completed > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => openMoveRemaining(grader)}
                  >
                    Move remaining to people…
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border/50">
                {visibleAssignments.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No assignments
                  </p>
                )}
                {visibleAssignments.map((a) => {
                  const isDone = a.status === 'completed';
                  const highlighted = Boolean(query && matchesQuery(a, query));
                  return (
                    <div
                      key={a.assignmentId}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5',
                        isDone && 'bg-green-50/40',
                        highlighted && 'bg-amber-50/80',
                      )}
                    >
                      <span className="w-7 shrink-0 text-sm tabular-nums text-muted-foreground">
                        #{a.applicantNumber}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          isDone && 'text-muted-foreground',
                        )}
                        title={a.candidateEmail}
                      >
                        {a.candidateName}
                      </span>
                      {isDone ? (
                        <StageBadge label="Done" color="green" size="compact" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReassign(a, grader)}
                          className="shrink-0 rounded-md px-2 py-1 text-sm text-destructive hover:bg-destructive/10"
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {query && data.graders.every((g) => !g.assignments.some((a) => matchesQuery(a, query))) && (
        <p className="text-sm text-muted-foreground">No applicants match “{search.trim()}”.</p>
      )}

      <Dialog open={reassignDraft !== null} onOpenChange={(open) => !open && setReassignDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign application</DialogTitle>
            <DialogDescription>
              {reassignDraft && (
                <>
                  Move <strong>{reassignDraft.appLabel}</strong> from{' '}
                  <strong>{reassignDraft.fromGraderName}</strong> to another grader. Use this for a
                  conflict of interest even though grading is blind.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {reassignDraft?.hasScores && (
            <p className="text-sm text-amber-800">
              This grader already started scoring. Reassigning drops those in-progress scores.
            </p>
          )}

          {reassignOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other graders are eligible for this application.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="newGrader" required>
                Assign to
              </Label>
              <NativeSelect
                id="newGrader"
                value={newUserId ?? ''}
                onChange={(e) => setNewUserId(Number.parseInt(e.target.value, 10))}
              >
                {reassignOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.total} assignments)
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {reassignError && <p className="text-sm text-destructive">{reassignError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReassignDraft(null)}>
              Cancel
            </Button>
            <LoadingButton
              disabled={reassignOptions.length === 0}
              loading={reassigning}
              onClick={handleReassignConfirm}
            >
              Reassign
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDraft !== null} onOpenChange={(open) => !open && setMoveDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move remaining applications</DialogTitle>
            <DialogDescription>
              {moveDraft && (
                <>
                  Take leftover apps from <strong>{moveDraft.fromGraderName}</strong> and give them
                  to people you pick. Use this if they had an emergency or are going too slowly.
                  Finished apps stay with them.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {moveDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="moveCount" required>
                  How many to move
                </Label>
                <Input
                  id="moveCount"
                  type="number"
                  min={1}
                  max={Math.max(moveCapacity, 1)}
                  value={moveCount}
                  onChange={(e) => setMoveCount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {moveCapacity} can be moved
                  {moveDraft.inProgress > 0 && !moveIncludeInProgress
                    ? ` (${moveDraft.inProgress} started, not included)`
                    : ''}
                  .
                </p>
              </div>

              {moveDraft.inProgress > 0 && (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={moveIncludeInProgress}
                    onCheckedChange={(checked) => {
                      const on = checked === true;
                      setMoveIncludeInProgress(on);
                      const nextCap = moveDraft.movable + (on ? moveDraft.inProgress : 0);
                      const current = Number.parseInt(moveCount, 10);
                      if (!Number.isInteger(current) || current < 1 || current > nextCap) {
                        setMoveCount(String(nextCap));
                      }
                    }}
                  />
                  <span>
                    Also move ones they started but didn’t finish. Their in-progress scores will be
                    dropped.
                  </span>
                </label>
              )}

              <div className="space-y-2">
                <Label required>Assign to</Label>
                {moveRecipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other people on this team’s pool.</p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-auto rounded-md border border-border/60 p-2">
                    {moveRecipients.map((g) => (
                      <li key={g.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm uma-hover-on-panel">
                          <Checkbox
                            checked={moveToIds.includes(g.id)}
                            onCheckedChange={(checked) =>
                              toggleMoveRecipient(g.id, checked === true)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{g.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {g.total}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {moveError && <p className="text-sm text-destructive">{moveError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveDraft(null)}>
              Cancel
            </Button>
            <LoadingButton
              disabled={moveRecipients.length === 0 || moveCapacity === 0}
              loading={moving}
              onClick={handleMoveRemaining}
            >
              Move applications
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
