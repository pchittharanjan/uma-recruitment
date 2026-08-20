'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import LoadingButton from '@/components/loading-button';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';

interface AssignmentEntry {
  assignmentId: number;
  applicationId: number;
  rowIndex: number;
  fields: Record<string, string>;
  status: string;
}

interface GraderData {
  id: number;
  name: string;
  email: string;
  total: number;
  completed: number;
  assignments: AssignmentEntry[];
}

interface AssignmentsData {
  team: { id: number; name: string };
  graders: GraderData[];
  csvHeaders: string[];
  scoreFields: string[];
}

interface ReassignDraft {
  assignmentId: number;
  applicationId: number;
  fromGraderId: number;
  fromGraderName: string;
  appLabel: string;
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

export default function TeamAssignmentsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const [data, setData] = useState<AssignmentsData | null>(null);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [reassignDraft, setReassignDraft] = useState<ReassignDraft | null>(null);
  const [newUserId, setNewUserId] = useState<number | null>(null);
  const [reassignError, setReassignError] = useState('');
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/assignments`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error);
        return;
      }
      setData(json);
    } catch {
      setError('Failed to load assignments');
    }
  }, [router, teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reassignOptions = useMemo(() => {
    if (!data || !reassignDraft) return [];
    return eligibleGraders(data.graders, reassignDraft.applicationId, reassignDraft.fromGraderId);
  }, [data, reassignDraft]);

  const openReassign = (
    assignment: AssignmentEntry,
    grader: GraderData,
    appLabel: string,
  ) => {
    const options = data
      ? eligibleGraders(data.graders, assignment.applicationId, grader.id)
      : [];
    setReassignDraft({
      assignmentId: assignment.assignmentId,
      applicationId: assignment.applicationId,
      fromGraderId: grader.id,
      fromGraderName: grader.name,
      appLabel,
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
      await fetchData();
    } catch {
      setReassignError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  if (error && !data) {
    return (
      <PageContainer>
        <StatusBanner message={error} type="error" />
      </PageContainer>
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  const contextFields = data.csvHeaders.filter((h) => !data.scoreFields.includes(h));
  const nameField =
    data.csvHeaders.find((h) => h === 'Full name') ??
    data.csvHeaders.find((h) => h === 'First name') ??
    data.csvHeaders.find((h) => h === 'Email') ??
    contextFields[0];

  const getAppLabel = (fields: Record<string, string>, rowIndex: number) =>
    nameField ? fields[nameField] || `Application #${rowIndex}` : `Application #${rowIndex}`;

  return (
    <PageContainer size="wide">
      <PageSection>
      <PageHeader
        eyebrow={data.team.name}
        title="Edit Assignments"
      />

        {successMsg && <StatusBanner message={successMsg} type="success" />}
        {error && <StatusBanner message={error} type="error" />}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {data.graders.map((g) => (
            <Card key={g.id} className="gap-1 p-4 text-center">
              <p className="truncate text-sm font-medium">{g.name}</p>
              <p className="text-2xl font-bold tabular-nums text-primary">{g.total}</p>
              <p className="text-sm text-muted-foreground">assignments</p>
              {g.completed > 0 && (
                <p className="text-sm text-emerald-700">{g.completed} done</p>
              )}
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.graders.map((grader) => (
            <Card key={grader.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{grader.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{grader.email}</p>
                </div>
                <StageBadge label={`${grader.total} apps`} color="blue" size="compact" />
              </div>
              <div className="divide-y divide-border/50">
                {grader.assignments.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No assignments
                  </p>
                )}
                {grader.assignments.map((a) => {
                  const label = getAppLabel(a.fields, a.rowIndex);
                  const isDone = a.status === 'completed';
                  return (
                    <div
                      key={a.assignmentId}
                      className={`flex items-center gap-3 px-4 py-2.5 ${isDone ? 'bg-green-50/40' : ''}`}
                    >
                      <span className="w-7 shrink-0 text-sm tabular-nums text-muted-foreground">
                        #{a.rowIndex}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${isDone ? 'text-muted-foreground' : ''}`}
                      >
                        {label}
                      </span>
                      {isDone ? (
                        <StageBadge label="Done" color="green" size="compact" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openReassign(a, grader, label)}
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
          ))}
        </div>
      </PageSection>

      <Dialog open={reassignDraft !== null} onOpenChange={(open) => !open && setReassignDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign application</DialogTitle>
            <DialogDescription>
              {reassignDraft && (
                <>
                  Move <strong>{reassignDraft.appLabel}</strong> from{' '}
                  <strong>{reassignDraft.fromGraderName}</strong> to another grader.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

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
    </PageContainer>
  );
}
