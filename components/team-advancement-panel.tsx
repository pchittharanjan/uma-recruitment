'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDownIcon, ChevronRightIcon, InfoIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { AdvancementActivityLog } from '@/components/advancement-activity-log';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdvancementRankColGroup } from '@/components/advancement-rank-table-columns';
import { AvgScoreCell, AvgScoreHeader } from '@/components/avg-score-header';
import {
  AdvancementVerdictSelector,
  PanelVerdictSummary,
  VerdictAccentBar,
  panelGreenCount,
  VERDICT_ACCENT_HEX,
  verdictRowClass,
  type AdvancementVerdict,
} from '@/components/advancement-verdict-selector';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AdvancementApplicationContext,
  AdvancementFromStage,
  AdvancementInterviewContext,
  AdvancementPanelVerdict,
} from '@/lib/advancement-submissions-types';
import { resolveAdvancementSelectionMax, resolveAdvancementSelectionMin, advancementPageDescription } from '@/lib/advancement-cap-helpers';
import { pendingWorkLabel, workActionVerb } from '@/lib/stages';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ApplicationAdvancementDetailPanel, prefetchAdvancementDetail } from '@/components/application-advancement-detail-panel';
import { useOptionalShellUser } from '@/components/shell-user-provider';
import {
  advancementStepGuide,
  recommendationsCompleteMessage,
} from '@/lib/next-step-guidance';

interface RankedApplicant {
  applicationId: number;
  rowIndex: number;
  displayId: string;
  candidateName?: string;
  average: number;
  /** Present for application-stage rankings only. */
  rawAverage?: number;
  rank: number;
}

interface AdvancementData {
  teamId: number;
  fromStage: AdvancementFromStage;
  advancementCap: number | null;
  allowOverCap?: boolean;
  selectionMin?: number | null;
  selectionMax?: number | null;
  round: { id: number; label: string; status: string };
  preview: {
    applications: RankedApplicant[];
    incompleteCount: number;
    totalApplications: number;
    interviewContext?: Record<string, AdvancementInterviewContext>;
    applicationContext?: Record<string, AdvancementApplicationContext>;
  };
  submission: {
    id: number;
    topN: number;
    status: string;
    candidates: RankedApplicant[];
    submittedAt: number;
    submittedBy: { name: string; email: string };
    reviewedBy: { name: string; email: string } | null;
    reviewedAt: number | null;
  } | null;
  history: Array<{
    id: number;
    topN: number;
    status: 'submitted' | 'approved' | 'withdrawn';
    fromStage?: AdvancementFromStage;
    submittedAt: number;
    submittedBy: { name: string; email: string };
    reviewedBy: { name: string; email: string } | null;
    reviewedAt: number | null;
    candidates?: Array<{
      applicationId: number;
      rowIndex: number;
      rank: number;
      average: number;
      rawAverage?: number;
      candidateName?: string | null;
      displayId?: string | null;
    }>;
  }>;
  readOnly?: boolean;
  canSubmit?: boolean;
  currentUser?: {
    id: number;
    name: string;
    role: string;
    isExec: boolean;
    isDirector?: boolean;
  };
}

const PANEL_CONFIG: Record<
  AdvancementFromStage,
  {
    title: string;
    description: string;
    readOnlyMessage: string;
    pendingLabel: string;
    blindDescription: string | null;
  }
> = {
  application: {
    title: 'Advance to First Round Interview',
    description: '',
    readOnlyMessage: 'The Application phase is complete. This advancement list is read-only.',
    pendingLabel: pendingWorkLabel('application'),
    blindDescription: null,
  },
  first_round: {
    title: 'Advance to Final Round Interview',
    description: '',
    readOnlyMessage:
      'The First Round Interview phase is complete. This advancement list is read-only.',
    pendingLabel: pendingWorkLabel('first_round'),
    blindDescription: null,
  },
};

function interviewContextFor(
  data: AdvancementData,
  applicationId: number,
): AdvancementInterviewContext | null {
  const ctx = data.preview.interviewContext?.[String(applicationId)];
  return ctx ?? data.preview.interviewContext?.[applicationId] ?? null;
}

function applicationContextFor(
  data: AdvancementData,
  applicationId: number,
): AdvancementApplicationContext | null {
  const ctx = data.preview.applicationContext?.[String(applicationId)];
  return ctx ?? data.preview.applicationContext?.[applicationId] ?? null;
}

function rowVerdictContext(
  data: AdvancementData,
  applicationId: number,
  fromStage: AdvancementFromStage,
): {
  canSetVerdict: boolean;
  myVerdict: AdvancementVerdict | null;
  panelVerdicts: AdvancementPanelVerdict[];
} {
  if (fromStage === 'first_round') {
    const ctx = interviewContextFor(data, applicationId);
    return {
      canSetVerdict: Boolean(ctx?.iInterviewed),
      myVerdict: ctx?.myVerdict ?? null,
      panelVerdicts: ctx?.panelVerdicts ?? [],
    };
  }
  const ctx = applicationContextFor(data, applicationId);
  return {
    canSetVerdict: Boolean(ctx?.iGraded),
    myVerdict: ctx?.myVerdict ?? null,
    panelVerdicts: ctx?.panelVerdicts ?? [],
  };
}

function readOnlyVerdictHint(fromStage: AdvancementFromStage): string {
  return fromStage === 'first_round' ? 'Not your interviewee' : 'Not your application';
}

function formatSlotTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface AdvancementSessionGroup {
  key: string;
  scheduledAt: string | null;
  location: string | null;
  isGroup: boolean;
  isUnscheduled: boolean;
  applicants: RankedApplicant[];
}

function isGroupInterviewContext(ctx: AdvancementInterviewContext | null): boolean {
  if (!ctx) return false;
  if (ctx.groupMembers.length > 1) return true;
  const groupKey = ctx.groupKey?.trim();
  return Boolean(groupKey && !groupKey.startsWith('solo-'));
}

function groupApplicantsBySession(
  rows: RankedApplicant[],
  data: AdvancementData,
): AdvancementSessionGroup[] {
  const map = new Map<string, AdvancementSessionGroup>();

  for (const app of rows) {
    const ctx = interviewContextFor(data, app.applicationId);
    const key = ctx?.sessionKey ?? 'unscheduled';
    const existing = map.get(key);
    if (existing) {
      existing.applicants.push(app);
      if (isGroupInterviewContext(ctx)) existing.isGroup = true;
      continue;
    }

    map.set(key, {
      key,
      scheduledAt: ctx?.scheduledAt ?? null,
      location: ctx?.location ?? null,
      isGroup: isGroupInterviewContext(ctx),
      isUnscheduled: key === 'unscheduled',
      applicants: [app],
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isUnscheduled && !b.isUnscheduled) return 1;
    if (!a.isUnscheduled && b.isUnscheduled) return -1;
    if (a.scheduledAt && b.scheduledAt) {
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }
    return a.key.localeCompare(b.key);
  });
}

function sessionSectionBadge(group: AdvancementSessionGroup): string | null {
  if (group.isUnscheduled) return null;
  if (group.isGroup) return 'Group';
  if (group.applicants.length > 1) return `${group.applicants.length} solo`;
  return null;
}

function sessionSectionLabel(group: AdvancementSessionGroup): string {
  if (group.isUnscheduled) return 'No interview slot assigned';

  const timeLabel = formatSlotTime(group.scheduledAt);
  const parts: string[] = [];
  if (timeLabel) parts.push(timeLabel);
  if (group.location) parts.push(group.location);
  return parts.join(' · ');
}

function ApplicantDetailPanel({
  context,
  candidateName,
}: {
  context: AdvancementInterviewContext;
  candidateName: string;
}) {
  const otherGroupMembers = context.groupMembers.filter(
    (member) => member.candidateName !== candidateName,
  );

  return (
    <div className="space-y-4 px-1 py-3 text-sm">
      {otherGroupMembers.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Group Members
          </p>
          <p className="mt-1 text-muted-foreground">
            {otherGroupMembers.map((member) => member.candidateName).join(', ')}
          </p>
        </div>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your notes
        </p>
        {context.myNotes?.trim() ? (
          <p className="display-field mt-1 whitespace-pre-wrap text-foreground">{context.myNotes}</p>
        ) : (
          <p className="mt-1 text-muted-foreground italic">No notes recorded.</p>
        )}
      </div>

      {context.panelNotes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Other interviewers' notes
          </p>
          {context.panelNotes.map((note) => (
            <div
              key={note.interviewerName}
              className="display-field px-3 py-2"
            >
              <p className="font-medium text-foreground">{note.interviewerName}</p>
              {note.comment?.trim() ? (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{note.comment}</p>
              ) : (
                <p className="mt-1 text-muted-foreground italic">No notes.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FinalAdvanceToggle({
  selected,
  atCap,
  label,
  onToggle,
}: {
  selected: boolean;
  atCap: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      aria-label={
        selected ? `Remove ${label} from advance list` : `Add ${label} to advance list`
      }
      disabled={atCap}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="min-w-[5.5rem]"
    >
      {selected ? 'Advancing' : 'Advance'}
    </Button>
  );
}

export function TeamAdvancementPanel({
  teamId,
  fromStage,
}: {
  teamId: string;
  fromStage: AdvancementFromStage;
}) {
  const router = useRouter();
  const shell = useOptionalShellUser();
  const teamName =
    shell?.teams.find((t) => String(t.id) === teamId)?.name ?? '';
  const config = PANEL_CONFIG[fromStage];
  const isFirstRound = fromStage === 'first_round';
  const [data, setData] = useState<AdvancementData | null>(null);
  const [error, setError] = useState('');
  const [verdicts, setVerdicts] = useState<Record<number, AdvancementVerdict>>({});
  const [finalSelection, setFinalSelection] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [filterMyInterviewees, setFilterMyInterviewees] = useState<boolean | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showSlotBreakdown, setShowSlotBreakdown] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(
      `/api/team/advancement?teamId=${teamId}&fromStage=${fromStage}`,
    );
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (res.status === 403) {
      setError(
        fromStage === 'first_round'
          ? 'You do not have access to this team advancement page.'
          : 'Only team Exec can view application advancement lists.',
      );
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load advancement data.');
      return;
    }
    setData(json);
    if (filterMyInterviewees === null && json.currentUser) {
      setFilterMyInterviewees(!json.currentUser.isExec);
    }
    const nextVerdicts: Record<number, AdvancementVerdict> = {};
    for (const app of json.preview.applications as RankedApplicant[]) {
      const { myVerdict } = rowVerdictContext(json, app.applicationId, fromStage);
      if (myVerdict) nextVerdicts[app.applicationId] = myVerdict;
    }
    if (json.submission?.status === 'submitted' || json.submission?.status === 'approved') {
      setFinalSelection(
        new Set((json.submission.candidates as RankedApplicant[]).map((c) => c.applicationId)),
      );
    } else {
      setFinalSelection(new Set());
    }
    setVerdicts(nextVerdicts);
  }, [filterMyInterviewees, fromStage, router, teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const panelGreenIds = useMemo(() => {
    if (!data) return new Set<number>();
    const ids = new Set<number>();
    for (const app of data.preview.applications) {
      const rowCtx = rowVerdictContext(data, app.applicationId, fromStage);
      const myVerdict = verdicts[app.applicationId] ?? rowCtx.myVerdict;
      if (panelGreenCount(myVerdict, rowCtx.panelVerdicts) > 0) {
        ids.add(app.applicationId);
      }
    }
    return ids;
  }, [data, fromStage, verdicts]);

  const advancementCap = data?.advancementCap ?? null;
  const allowOverCap = Boolean(data?.allowOverCap);
  const usesFinalSelection = advancementCap !== null || allowOverCap;
  const panelGreenCountTotal = panelGreenIds.size;
  const finalCount = finalSelection.size;
  const previousSubmittedCount =
    data?.submission?.status === 'submitted' ? data.submission.candidates.length : null;
  const selectionMin =
    data?.selectionMin ??
    (data
      ? resolveAdvancementSelectionMin({
          cap: advancementCap,
          totalRanked: data.preview.totalApplications,
          allowOverCap,
        })
      : null);
  const selectionMax =
    data?.selectionMax ??
    (data
      ? resolveAdvancementSelectionMax({
          cap: advancementCap,
          totalRanked: data.preview.totalApplications,
          allowOverCap,
          previousSubmittedCount,
        })
      : null);
  const minAdvanceCount = selectionMin ?? 0;
  const maxAdvanceCount = selectionMax ?? 0;
  /** Official target for “select top N” — not the over-cap pool ceiling. */
  const targetAdvanceCount = minAdvanceCount;

  const selectedIds = usesFinalSelection ? finalSelection : panelGreenIds;
  const selectedCount = selectedIds.size;

  const setVerdict = async (applicationId: number, verdict: AdvancementVerdict | null) => {
    const previous = verdicts[applicationId] ?? null;
    setVerdicts((prev) => {
      const next = { ...prev };
      if (verdict === null) delete next[applicationId];
      else next[applicationId] = verdict;
      return next;
    });

    try {
      const res = await fetch(`/api/team/advancement/verdict?fromStage=${fromStage}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: Number(teamId),
          applicationId,
          verdict,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVerdicts((prev) => {
          const next = { ...prev };
          if (previous === null) delete next[applicationId];
          else next[applicationId] = previous;
          return next;
        });
        toast.error(json.error ?? 'Failed to save verdict.');
        return;
      }

      setData((prev) => {
        if (!prev) return prev;
        const key = fromStage === 'first_round' ? 'interviewContext' : 'applicationContext';
        const ctxMap = prev.preview[key];
        if (!ctxMap) return prev;
        const existing = ctxMap[String(applicationId)] ?? ctxMap[applicationId];
        if (!existing) return prev;
        const updated = { ...existing, myVerdict: verdict };
        return {
          ...prev,
          preview: {
            ...prev.preview,
            [key]: { ...ctxMap, [applicationId]: updated, [String(applicationId)]: updated },
          },
        };
      });
    } catch {
      setVerdicts((prev) => {
        const next = { ...prev };
        if (previous === null) delete next[applicationId];
        else next[applicationId] = previous;
        return next;
      });
      toast.error('Failed to save verdict.');
    }
  };

  const toggleExpanded = (applicationId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  };

  const selectTop = (count: number) => {
    if (!data) return;
    const editable = visibleRows.filter(
      (app) => rowVerdictContext(data, app.applicationId, fromStage).canSetVerdict,
    );
    for (const app of editable.slice(0, count)) {
      void setVerdict(app.applicationId, 'green');
    }
  };

  const clearSelection = () => {
    if (!data) return;
    for (const app of visibleRows) {
      const { canSetVerdict } = rowVerdictContext(data, app.applicationId, fromStage);
      if (canSetVerdict && verdicts[app.applicationId]) {
        void setVerdict(app.applicationId, null);
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const body: {
        teamId: number;
        fromStage: AdvancementFromStage;
        applicationIds?: number[];
      } = {
        teamId: Number(teamId),
        fromStage,
      };
      if (usesFinalSelection) {
        body.applicationIds = [...finalSelection];
      }
      const res = await fetch('/api/team/advancement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Submission failed.';
        setSubmitError(message);
        toast.error(message);
        return;
      }
      toast.success('Advancement list submitted');
      await fetchData();
    } catch {
      setSubmitError('Submission failed.');
      toast.error('Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = data?.submission?.status === 'submitted';
  const isApproved = data?.submission?.status === 'approved';
  const isReadOnly = Boolean(data?.readOnly);
  const canSubmitList = Boolean(data?.canSubmit ?? data?.currentUser?.isDirector);
  const canSubmitAdvancement =
    canSubmitList && (advancementCap !== null || allowOverCap);
  const canMarkVerdicts = Boolean(data && !isApproved && !isReadOnly);
  const showFinalAdvanceColumn =
    usesFinalSelection && canSubmitAdvancement && (canMarkVerdicts || isPending);
  const showDecisionColumn = canMarkVerdicts || isPending || isApproved;

  const submitSelectionReady =
    minAdvanceCount > 0 &&
    maxAdvanceCount > 0 &&
    (usesFinalSelection
      ? finalCount >= minAdvanceCount && finalCount <= maxAdvanceCount
      : selectedCount > 0);

  const toggleFinalAdvance = (applicationId: number, checked: boolean) => {
    setFinalSelection((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (maxAdvanceCount > 0 && next.size >= maxAdvanceCount) return prev;
        next.add(applicationId);
      } else {
        next.delete(applicationId);
      }
      return next;
    });
  };

  const selectTopToAdvance = (count: number) => {
    if (!data) return;
    const pool = [...data.preview.applications]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, count);
    setFinalSelection(new Set(pool.map((app) => app.applicationId)));
  };

  const clearFinalAdvance = () => setFinalSelection(new Set());

  const advancementRowClass = (applicationId: number, verdict: AdvancementVerdict | null) => {
    const advanced = usesFinalSelection && finalSelection.has(applicationId);
    return cn(
      verdictRowClass(verdict),
      advanced && 'bg-green-50/70 dark:bg-green-950/25',
    );
  };

  const advancementAccentOverride = (applicationId: number): string | null => {
    const advanced = usesFinalSelection && finalSelection.has(applicationId);
    return advanced ? VERDICT_ACCENT_HEX.green : null;
  };

  const submittedIdSet =
    isApproved || (isReadOnly && data?.submission)
      ? new Set(data!.submission!.candidates.map((c) => c.applicationId))
      : usesFinalSelection
        ? finalSelection
        : selectedIds;

  const displayVerdict = (applicationId: number): AdvancementVerdict | null => {
    if (isApproved || (isReadOnly && data?.submission)) {
      return submittedIdSet.has(applicationId) ? 'green' : null;
    }
    if (!data) return null;
    const { myVerdict } = rowVerdictContext(data, applicationId, fromStage);
    return verdicts[applicationId] ?? myVerdict ?? null;
  };

  const applicantLabel = (app: RankedApplicant) =>
    fromStage === 'first_round' ? (app.candidateName ?? app.displayId) : app.displayId;

  const baseTableRows =
    isApproved || (isReadOnly && data?.submission)
      ? data!.submission!.candidates
      : data?.preview.applications ?? [];

  const myIntervieweeCount = useMemo(() => {
    if (!data?.preview.interviewContext) return 0;
    return baseTableRows.filter((app) => interviewContextFor(data, app.applicationId)?.iInterviewed)
      .length;
  }, [baseTableRows, data]);

  const visibleRows = useMemo(() => {
    if (!isFirstRound || !filterMyInterviewees || !data?.preview.interviewContext) {
      return baseTableRows;
    }
    return baseTableRows.filter(
      (app) => interviewContextFor(data, app.applicationId)?.iInterviewed,
    );
  }, [baseTableRows, data, filterMyInterviewees, isFirstRound]);

  const sessionGroups = useMemo(() => {
    if (!isFirstRound || !data) return [];
    return groupApplicantsBySession(visibleRows, data);
  }, [visibleRows, data, isFirstRound]);

  const groupPanelSummaries = useMemo(() => {
    if (!isFirstRound || !data) return [];
    return groupApplicantsBySession(data.preview.applications, data)
      .filter((group) => !group.isUnscheduled)
      .map((group) => ({
        key: group.key,
        label: sessionSectionLabel(group) || 'No slot',
        yesCount: group.applicants.filter((app) => panelGreenIds.has(app.applicationId)).length,
      }));
  }, [data, isFirstRound, panelGreenIds]);

  const showApplicationView = !isFirstRound;
  const showExpandColumn = isFirstRound;

  const canViewApplication = useCallback(
    (applicationId: number) => {
      if (!data || isFirstRound) return false;
      if (canSubmitList) return true;
      return rowVerdictContext(data, applicationId, fromStage).canSetVerdict;
    },
    [canSubmitList, data, fromStage, isFirstRound],
  );

  const detailColumnCount =
    (showExpandColumn ? 1 : 0) +
    (showApplicationView ? 1 : 0) +
    (showDecisionColumn ? 1 : 0) +
    (showFinalAdvanceColumn ? 1 : 0) +
    4;

  const myColorCount = useMemo(
    () => Object.entries(verdicts).filter(([, v]) => v !== null).length,
    [verdicts],
  );

  const myVerdictTargets = useMemo(() => {
    if (!data) return { total: 0, set: 0 };
    let total = 0;
    let set = 0;
    for (const app of data.preview.applications) {
      const ctx = rowVerdictContext(data, app.applicationId, fromStage);
      if (!ctx.canSetVerdict) continue;
      total += 1;
      const current = verdicts[app.applicationId] ?? ctx.myVerdict;
      if (current) set += 1;
    }
    return { total, set };
  }, [data, fromStage, verdicts]);

  const myRecommendationsComplete =
    myVerdictTargets.total > 0 && myVerdictTargets.set === myVerdictTargets.total;

  if (error) {
    return (
      <PageContainer size="full">
        <StatusBanner type="error" message={error} />
      </PageContainer>
    );
  }

  if (!data) return <PageLoading />;

  return (
    <PageContainer size="full" className="space-y-8">
      <PageHeader
        eyebrow={teamName || `Team ${teamId}`}
        title={config.title}
        description={advancementPageDescription(
          fromStage,
          data.preview.totalApplications,
          advancementCap,
          allowOverCap,
        )}
      />

      {isReadOnly && <StatusBanner type="info" message={config.readOnlyMessage} />}

      {canMarkVerdicts && !isPending && !isApproved && (
        <StatusBanner type="info" message={advancementStepGuide(canSubmitList)} />
      )}

      {!canSubmitList && canMarkVerdicts && myRecommendationsComplete && (
        <StatusBanner
          type="success"
          message={recommendationsCompleteMessage(false)}
        />
      )}

      {canSubmitList && canMarkVerdicts && myRecommendationsComplete && !isPending && !isApproved && (
        <StatusBanner
          type="success"
          message={recommendationsCompleteMessage(true)}
        />
      )}

      {usesFinalSelection && !canSubmitList && !canMarkVerdicts && isFirstRound && (
        <StatusBanner
          type="info"
          message="Set color signals only for applicants you interviewed."
        />
      )}

      {data.preview.incompleteCount > 0 && canMarkVerdicts && (
        <StatusBanner
          type="warning"
          message={`${data.preview.incompleteCount} ${config.pendingLabel}${data.preview.incompleteCount === 1 ? '' : 's'} still pending. Finish ${workActionVerb(data.fromStage)}ing before Directors can submit the advancement list.`}
        />
      )}

      {isPending && data.submission && (
        <StatusBanner
          type="info"
          message={`${data.submission.submittedBy.name} submitted ${data.submission.topN} applicant${data.submission.topN === 1 ? '' : 's'} on ${new Date(data.submission.submittedAt * 1000).toLocaleString()} — waiting for Admin approval.`}
        />
      )}

      {usesFinalSelection &&
        canSubmitAdvancement &&
        canMarkVerdicts &&
        allowOverCap &&
        advancementCap !== null && (
          <StatusBanner
            type="info"
            message={`Admin allowed selecting past the usual limit of ${advancementCap}. Select at least ${minAdvanceCount} (up to ${maxAdvanceCount}).`}
          />
        )}

      {usesFinalSelection &&
        canSubmitAdvancement &&
        canMarkVerdicts &&
        !allowOverCap &&
        advancementCap !== null &&
        previousSubmittedCount != null &&
        previousSubmittedCount > advancementCap && (
          <StatusBanner
            type="warning"
            message={`Your pending list has ${previousSubmittedCount} applicants, over the current limit of ${advancementCap}. You can keep up to ${maxAdvanceCount} but cannot add more unless an admin raises the limit or allows over cap.`}
          />
        )}

      {usesFinalSelection &&
        canSubmitAdvancement &&
        canMarkVerdicts &&
        isPending &&
        !allowOverCap &&
        advancementCap !== null &&
        finalCount < minAdvanceCount &&
        minAdvanceCount > (previousSubmittedCount ?? 0) && (
          <StatusBanner
            type="info"
            message={`The advancement limit is now ${minAdvanceCount}. Add ${minAdvanceCount - finalCount} more applicant${minAdvanceCount - finalCount === 1 ? '' : 's'} to reach exactly ${minAdvanceCount}.`}
          />
        )}

      {isApproved && data.submission && (
        <StatusBanner
          type="success"
          message={`Admin approved the list of ${data.submission.topN} applicant${data.submission.topN === 1 ? '' : 's'} submitted by ${data.submission.submittedBy.name}.`}
        />
      )}

      <PageSection className="space-y-6">
        {(canSubmitAdvancement || (data.submission && (isPending || isApproved))) && (
          <Card>
            <CardHeader>
              <CardTitle>
                {usesFinalSelection ? 'Final list to admin' : 'Selection'}
              </CardTitle>
              {canSubmitAdvancement && usesFinalSelection && canMarkVerdicts && (
                <CardAction>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="How final selection works"
                      >
                        <InfoIcon className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        Panel color signals are advisory. Your Advance selections are what Admin
                        receives.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardAction>
              )}
              {canSubmitAdvancement ? (
                usesFinalSelection ? (
                  <CardDescription>
                    {minAdvanceCount === maxAdvanceCount
                      ? `Select exactly ${minAdvanceCount} to advance`
                      : allowOverCap
                        ? `Select at least ${minAdvanceCount} to advance (up to ${maxAdvanceCount})`
                        : `Select at least ${minAdvanceCount} to advance (you may keep up to ${maxAdvanceCount} from your pending list)`}
                    {allowOverCap && advancementCap !== null
                      ? ` — over the usual limit of ${advancementCap}`
                      : ''}
                    . Panel color signals are advisory.
                  </CardDescription>
                ) : (
                  <CardDescription>
                    {isPending
                      ? `${selectedCount} Green · update while Admin review is pending.`
                      : `Submit sends all Green signals (${selectedCount} marked).`}
                  </CardDescription>
                )
              ) : (
                <CardDescription>
                  {data.submission!.topN} applicants in your submitted list.
                </CardDescription>
              )}
              {canSubmitAdvancement &&
                usesFinalSelection &&
                canMarkVerdicts &&
                groupPanelSummaries.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-sm text-muted-foreground">
                      {groupPanelSummaries.length} interview slot
                      {groupPanelSummaries.length === 1 ? '' : 's'} · {panelGreenCountTotal}{' '}
                      Green
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 py-0 text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => setShowSlotBreakdown((prev) => !prev)}
                    >
                      {showSlotBreakdown ? 'Hide by slot' : 'View by slot'}
                      {showSlotBreakdown ? (
                        <ChevronDownIcon className="ml-1 size-3" />
                      ) : (
                        <ChevronRightIcon className="ml-1 size-3" />
                      )}
                    </Button>
                    {showSlotBreakdown && (
                      <div className="flex flex-wrap gap-1.5">
                        {groupPanelSummaries.map((group) => (
                          <span
                            key={group.key}
                            className="display-field px-2 py-0.5 text-sm text-muted-foreground"
                          >
                            {group.label}: {group.yesCount} Green
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
            </CardHeader>
            {canSubmitAdvancement && canMarkVerdicts && (
              <CardContent className="space-y-4 pt-4">
                {usesFinalSelection ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      className="h-auto px-0 text-sm font-normal text-foreground underline-offset-4 hover:underline"
                      onClick={() => selectTopToAdvance(targetAdvanceCount)}
                    >
                      Select top {targetAdvanceCount} by score
                    </LoadingButton>
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      className="h-auto px-0 text-sm font-normal text-foreground underline-offset-4 hover:underline"
                      onClick={clearFinalAdvance}
                    >
                      Clear final list
                    </LoadingButton>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      className="h-auto px-0 text-sm font-normal text-foreground underline-offset-4 hover:underline"
                      onClick={() => selectTop(10)}
                    >
                      Mark top 10 Green
                    </LoadingButton>
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      className="h-auto px-0 text-sm font-normal text-foreground underline-offset-4 hover:underline"
                      onClick={() => selectTop(15)}
                    >
                      Mark top 15 Green
                    </LoadingButton>
                    <LoadingButton
                      variant="secondary"
                      size="sm"
                      className="h-auto px-0 text-sm font-normal text-foreground underline-offset-4 hover:underline"
                      onClick={clearSelection}
                    >
                      Clear all
                    </LoadingButton>
                  </div>
                )}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium tabular-nums text-green-700 dark:text-green-400">
                        {usesFinalSelection ? finalCount : selectedCount}
                      </span>
                      {usesFinalSelection
                        ? minAdvanceCount === maxAdvanceCount
                          ? ` of ${minAdvanceCount} selected`
                          : finalCount >= minAdvanceCount
                            ? ` selected (need at least ${minAdvanceCount})`
                            : ` of ${minAdvanceCount}+ selected`
                        : ' to advance'}
                    </p>
                    {usesFinalSelection && panelGreenCountTotal > 0 && (
                      <>
                        <span className="text-muted-foreground/50" aria-hidden>
                          ·
                        </span>
                        <p>
                          <span className="font-medium tabular-nums text-foreground">
                            {panelGreenCountTotal}
                          </span>{' '}
                          Green
                        </p>
                      </>
                    )}
                    {!usesFinalSelection && myColorCount > 0 && (
                      <>
                        <span className="text-muted-foreground/50" aria-hidden>
                          ·
                        </span>
                        <p>
                          <span className="font-medium tabular-nums text-foreground">
                            {myColorCount}
                          </span>{' '}
                          signals set
                        </p>
                      </>
                    )}
                  </div>
                  <LoadingButton
                    loading={submitting}
                    disabled={data.preview.incompleteCount > 0 || !submitSelectionReady}
                    onClick={handleSubmit}
                    className="w-full shrink-0 sm:w-auto sm:min-w-44"
                  >
                    {isPending ? 'Update list to admin' : 'Submit list to admin'}
                  </LoadingButton>
                </div>
                {submitError && <p className="text-sm text-destructive">{submitError}</p>}
              </CardContent>
            )}
          </Card>
        )}

        <Card className="overflow-visible">
          <CardHeader className="gap-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>
                  {isPending || isApproved ? 'Submitted applicants' : 'Ranked applicants'}
                </CardTitle>
                {canMarkVerdicts && config.blindDescription && !canSubmitList && (
                  <CardDescription>{config.blindDescription}</CardDescription>
                )}
              </div>
              {isFirstRound && myIntervieweeCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/35 px-3 py-2">
                  <Checkbox
                    id="filter-my-interviewees"
                    checked={Boolean(filterMyInterviewees)}
                    onCheckedChange={(checked) => setFilterMyInterviewees(checked === true)}
                  />
                  <Label htmlFor="filter-my-interviewees" className="cursor-pointer text-sm">
                    My interviewees only ({myIntervieweeCount})
                  </Label>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-visible pt-5">
            {isFirstRound && filterMyInterviewees && visibleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed interviews found for you. Turn off the filter to see the full ranked
                list.
              </p>
            ) : isFirstRound ? (
              <div className="space-y-4">
                {sessionGroups.map((group) => {
                  const timeLabel = sessionSectionLabel(group);
                  const sectionBadge = sessionSectionBadge(group);
                  const groupGreenCount = group.applicants.filter((app) =>
                    panelGreenIds.has(app.applicationId),
                  ).length;

                  return (
                    <div
                      key={group.key}
                      className="overflow-visible rounded-lg bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center gap-2 bg-muted/50 px-4 py-2">
                        <p className="text-sm font-medium">
                          {group.isUnscheduled ? 'No slot assigned' : timeLabel}
                        </p>
                        {sectionBadge && (
                          <span className="rounded bg-muted/30 px-1.5 py-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {sectionBadge}
                          </span>
                        )}
                        {groupGreenCount > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {groupGreenCount} Green
                          </span>
                        )}
                      </div>
                      <Table className="w-full table-fixed border-separate border-spacing-0 [&_td]:py-2.5">
                        <AdvancementRankColGroup
                          expand
                          decision={showDecisionColumn}
                          advance={showFinalAdvanceColumn}
                        />
                        <TableHeader>
                          <TableRow>
                            <TableHead className="px-2" />
                            {showDecisionColumn && (
                              <TableHead className="px-3">Recommendation</TableHead>
                            )}
                            <TableHead className="px-3">Rank</TableHead>
                            <TableHead className="px-3">Applicant</TableHead>
                            <AvgScoreHeader
                              className="px-3"
                              variant={isFirstRound ? 'interview' : 'application'}
                            />
                            <TableHead className="px-3">Status</TableHead>
                            {showFinalAdvanceColumn && (
                              <TableHead className="px-3">Advance</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.applicants.map((app) => {
                            const verdict = displayVerdict(app.applicationId);
                            const context = interviewContextFor(data, app.applicationId);
                            const rowCtx = rowVerdictContext(data, app.applicationId, fromStage);
                            const expanded = expandedIds.has(app.applicationId);
                            const mine = Boolean(context?.iInterviewed);

                            return (
                              <Fragment key={app.applicationId}>
                                <TableRow
                                  className={cn(
                                    advancementRowClass(app.applicationId, verdict),
                                    !verdict &&
                                      !usesFinalSelection &&
                                      mine &&
                                      !filterMyInterviewees &&
                                      'bg-sky-50/50 dark:bg-sky-950/15',
                                  )}
                                >
                                  <TableCell
                                    className="relative"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <VerdictAccentBar
                                      verdict={verdict}
                                      colorOverride={advancementAccentOverride(app.applicationId)}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      className="size-7"
                                      aria-expanded={expanded}
                                      aria-label={
                                        expanded
                                          ? `Collapse details for ${applicantLabel(app)}`
                                          : `Expand details for ${applicantLabel(app)}`
                                      }
                                      onClick={() => toggleExpanded(app.applicationId)}
                                    >
                                      {expanded ? (
                                        <ChevronDownIcon className="size-4" />
                                      ) : (
                                        <ChevronRightIcon className="size-4" />
                                      )}
                                    </Button>
                                  </TableCell>
                                  {showDecisionColumn && (
                                    <TableCell className="px-3">
                                      <AdvancementVerdictSelector
                                        value={verdicts[app.applicationId] ?? rowCtx.myVerdict ?? null}
                                        onChange={(next) => void setVerdict(app.applicationId, next)}
                                        applicantLabel={applicantLabel(app)}
                                        readOnlyHint={
                                          canMarkVerdicts && !rowCtx.canSetVerdict
                                            ? readOnlyVerdictHint(fromStage)
                                            : undefined
                                        }
                                        disabled={!canMarkVerdicts || !rowCtx.canSetVerdict}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell className="px-3 tabular-nums">{app.rank}</TableCell>
                                  <TableCell className="min-w-0 px-3">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <span className="truncate font-medium">
                                        {applicantLabel(app)}
                                      </span>
                                      {mine && !filterMyInterviewees && (
                                        <span className="rounded bg-sky-100/80 px-1.5 py-px text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                          Yours
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-3 text-left">
                                    <AvgScoreCell
                                      average={app.average}
                                      rawAverage={isFirstRound ? undefined : app.rawAverage}
                                    />
                                  </TableCell>
                                  <TableCell className="px-3 whitespace-normal">
                                    <PanelVerdictSummary
                                      panelVerdicts={rowCtx.panelVerdicts}
                                      myVerdict={verdict}
                                    />
                                  </TableCell>
                                  {showFinalAdvanceColumn && (
                                    <TableCell className="px-3">
                                      <FinalAdvanceToggle
                                        selected={finalSelection.has(app.applicationId)}
                                        atCap={
                                          !finalSelection.has(app.applicationId) &&
                                          maxAdvanceCount > 0 &&
                                          finalSelection.size >= maxAdvanceCount
                                        }
                                        label={applicantLabel(app)}
                                        onToggle={() =>
                                          toggleFinalAdvance(
                                            app.applicationId,
                                            !finalSelection.has(app.applicationId),
                                          )
                                        }
                                      />
                                    </TableCell>
                                  )}
                                </TableRow>
                                {expanded && context && (
                                  <TableRow
                                    key={`${app.applicationId}-detail`}
                                    className="hover:bg-transparent"
                                  >
                                    <TableCell colSpan={detailColumnCount} className="min-w-0 bg-muted/50 p-4 whitespace-normal break-words">
                                      <ApplicantDetailPanel
                                        context={context}
                                        candidateName={applicantLabel(app)}
                                      />
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Table className="w-full table-fixed border-separate border-spacing-0 [&_td]:py-2.5">
                <AdvancementRankColGroup
                  decision={showDecisionColumn}
                  advance={showFinalAdvanceColumn}
                  view={showApplicationView}
                />
                <TableHeader>
                  <TableRow>
                    {showDecisionColumn && (
                      <TableHead className="px-3">
                        {usesFinalSelection ? 'Recommendation' : 'Decision'}
                      </TableHead>
                    )}
                    <TableHead className="px-3">Rank</TableHead>
                    <TableHead className="px-3">Applicant</TableHead>
                    {showApplicationView && (
                      <TableHead className="px-3">Application</TableHead>
                    )}
                    <AvgScoreHeader
                      className="px-3"
                      variant={isFirstRound ? 'interview' : 'application'}
                    />
                    <TableHead className="px-3">Status</TableHead>
                    {showFinalAdvanceColumn && (
                      <TableHead className="px-3">Advance</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((app) => {
                    const verdict = displayVerdict(app.applicationId);
                    const rowCtx = rowVerdictContext(data, app.applicationId, fromStage);
                    const expanded = expandedIds.has(app.applicationId);

                    return (
                      <Fragment key={app.applicationId}>
                        <TableRow className={advancementRowClass(app.applicationId, verdict)}>
                          {showDecisionColumn && (
                            <TableCell className="relative px-3">
                              <VerdictAccentBar
                                verdict={verdict}
                                colorOverride={advancementAccentOverride(app.applicationId)}
                              />
                              <AdvancementVerdictSelector
                                value={verdicts[app.applicationId] ?? rowCtx.myVerdict ?? null}
                                onChange={(next) => void setVerdict(app.applicationId, next)}
                                applicantLabel={applicantLabel(app)}
                                readOnlyHint={
                                  canMarkVerdicts && !rowCtx.canSetVerdict
                                    ? readOnlyVerdictHint(fromStage)
                                    : undefined
                                }
                                disabled={!canMarkVerdicts || !rowCtx.canSetVerdict}
                              />
                            </TableCell>
                          )}
                          <TableCell className="px-3 tabular-nums">{app.rank}</TableCell>
                          <TableCell className="min-w-0 px-3">
                            <span className="block truncate font-medium">
                              {applicantLabel(app)}
                            </span>
                          </TableCell>
                          {showApplicationView && (
                            <TableCell className="px-3">
                              {canViewApplication(app.applicationId) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  aria-expanded={expanded}
                                  onMouseEnter={() =>
                                    prefetchAdvancementDetail(teamId, app.applicationId)
                                  }
                                  onFocus={() =>
                                    prefetchAdvancementDetail(teamId, app.applicationId)
                                  }
                                  onClick={() => toggleExpanded(app.applicationId)}
                                >
                                  {expanded ? 'Hide' : 'View'}
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="px-3 text-left">
                            <AvgScoreCell
                              average={app.average}
                              rawAverage={isFirstRound ? undefined : app.rawAverage}
                            />
                          </TableCell>
                          <TableCell className="px-3 whitespace-normal">
                            <PanelVerdictSummary
                              panelVerdicts={rowCtx.panelVerdicts}
                              myVerdict={verdict}
                            />
                          </TableCell>
                          {showFinalAdvanceColumn && (
                            <TableCell className="px-3">
                              <FinalAdvanceToggle
                                selected={finalSelection.has(app.applicationId)}
                                atCap={
                                  !finalSelection.has(app.applicationId) &&
                                  maxAdvanceCount > 0 &&
                                  finalSelection.size >= maxAdvanceCount
                                }
                                label={applicantLabel(app)}
                                onToggle={() =>
                                  toggleFinalAdvance(
                                    app.applicationId,
                                    !finalSelection.has(app.applicationId),
                                  )
                                }
                              />
                            </TableCell>
                          )}
                        </TableRow>
                        {expanded && canViewApplication(app.applicationId) && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={detailColumnCount} className="min-w-0 bg-muted/50 p-4 whitespace-normal break-words">
                              <ApplicationAdvancementDetailPanel
                                teamId={teamId}
                                applicationId={app.applicationId}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageSection>

      {data.history.length > 0 && (
        <PageSection>
          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-base">Submission log</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <AdvancementActivityLog entries={data.history} hideHeader />
            </CardContent>
          </Card>
        </PageSection>
      )}
    </PageContainer>
  );
}
