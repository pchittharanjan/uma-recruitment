'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import { SchedulePersonInput, type PersonOption } from '@/components/schedule-person-input';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection, TitleCount } from '@/components/page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberDraftInput } from '@/components/number-draft-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  assignmentsFromUiSessions,
  validateInterviewerAssignments,
} from '@/lib/interview-schedule-validation';
import { MAX_INTERVIEW_GROUP_SIZE } from '@/lib/interview-schedule-config';
import { cn } from '@/lib/utils';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import { toast } from 'sonner';

function formatLabel(format: 'group' | 'individual'): string {
  return format === 'group' ? 'Group Interviews' : 'Individual Interviews';
}

interface Interviewer {
  id: number;
  name: string;
  email: string;
}

interface SlotRow {
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  scheduledAt: string;
  location: string;
  logisticsNote: string;
  groupKey: string;
  interviewerIds: number[];
}

interface TimeBlock {
  index: number;
  label: string;
  scheduledAt: string;
}

interface ScheduleConfig {
  firstRoundDate: string | null;
  firstRoundStartTime: string;
  finalRoundDate: string | null;
  finalRoundStartTime: string;
  blockMinutes: number;
  groupSize: number;
  parallelGroupsPerBlock: number;
}

interface ScheduleData {
  team: { id: number; name: string };
  round: { id: number; label: string; status?: string };
  interviewers: Interviewer[];
  slots: SlotRow[];
  scheduleConfig: ScheduleConfig;
  interviewFormat: 'group' | 'individual';
  timeBlocks: TimeBlock[];
}

interface ScheduleSession {
  id: string;
  scheduledAt: string;
  applicantApplicationIds: (number | null)[];
  interviewerIds: (number | null)[];
  location: string;
}

type SortColumn = 'time' | 'applicants' | 'interviewers' | 'location';
type SortState = { column: SortColumn; direction: 'asc' | 'desc' } | null;

function compareSessionsByTime(a: ScheduleSession, b: ScheduleSession): number {
  const aTime = a.scheduledAt.trim();
  const bTime = b.scheduledAt.trim();
  if (!aTime && !bTime) return 0;
  if (!aTime) return 1;
  if (!bTime) return -1;
  return aTime.localeCompare(bTime);
}

function compareSessionsByLocation(a: ScheduleSession, b: ScheduleSession): number {
  const aLoc = a.location.trim().toLowerCase();
  const bLoc = b.location.trim().toLowerCase();
  if (!aLoc && !bLoc) return 0;
  if (!aLoc) return 1;
  if (!bLoc) return -1;
  return aLoc.localeCompare(bLoc);
}

function firstApplicantLabel(
  session: ScheduleSession,
  labelsById: Map<number, string>,
): string {
  for (const id of session.applicantApplicationIds) {
    if (id != null) {
      const label = labelsById.get(id);
      if (label) return label.toLowerCase();
    }
  }
  return '';
}

function firstInterviewerName(
  session: ScheduleSession,
  namesById: Map<number, string>,
): string {
  for (const id of session.interviewerIds) {
    if (id != null) {
      const name = namesById.get(id);
      if (name) return name.toLowerCase();
    }
  }
  return '';
}

function compareByEmptyLast(aValue: string, bValue: string): number {
  if (!aValue && !bValue) return 0;
  if (!aValue) return 1;
  if (!bValue) return -1;
  return aValue.localeCompare(bValue);
}

let sessionCounter = 0;
function newSessionId() {
  sessionCounter += 1;
  return `session-${sessionCounter}`;
}

function emptySession(): ScheduleSession {
  return {
    id: newSessionId(),
    scheduledAt: '',
    applicantApplicationIds: [],
    interviewerIds: [],
    location: '',
  };
}

interface DaySettingsSnapshot {
  dayDate: string;
  dayStartTime: string;
  blockMinutes: number;
}

function serializeSessionsForBaseline(sessions: ScheduleSession[]): string {
  return JSON.stringify(
    sessions.map((s) => ({
      scheduledAt: s.scheduledAt,
      applicantApplicationIds: s.applicantApplicationIds,
      interviewerIds: s.interviewerIds,
      location: s.location,
    })),
  );
}

function daySettingsFromConfig(
  config: ScheduleConfig,
  stage: 'first_round' | 'final_round',
): DaySettingsSnapshot {
  return {
    dayDate:
      stage === 'first_round'
        ? (config.firstRoundDate ?? '')
        : (config.finalRoundDate ?? ''),
    dayStartTime:
      stage === 'first_round'
        ? config.firstRoundStartTime
        : config.finalRoundStartTime,
    blockMinutes: config.blockMinutes,
  };
}

function serializeDaySettings(snapshot: DaySettingsSnapshot): string {
  return JSON.stringify(snapshot);
}

function saveButtonLabel(loading: boolean, dirty: boolean, idleLabel: string): string {
  if (loading) return 'Saving…';
  if (!dirty) return 'Saved';
  return idleLabel;
}

function maxApplicantsForFormat(format: 'group' | 'individual', groupSize: number): number {
  return format === 'group' ? groupSize : 1;
}

function slotsToSessions(
  slots: SlotRow[],
  format: 'group' | 'individual',
  groupSize: number,
): ScheduleSession[] {
  const assigned = slots.filter((s) => s.scheduledAt.trim());
  if (assigned.length === 0) return [];

  const sessionMap = new Map<string, ScheduleSession>();
  const maxPerSession = maxApplicantsForFormat(format, groupSize);

  for (const slot of assigned) {
    const baseKey = slot.groupKey
      ? `${slot.scheduledAt}|${slot.groupKey}`
      : `${slot.scheduledAt}|solo-${slot.applicationId}`;

    let sessionKey = baseKey;
    let session = sessionMap.get(sessionKey);

    if (session && format === 'group') {
      const filled = session.applicantApplicationIds.filter((id) => id != null).length;
      if (filled >= maxPerSession) {
        sessionKey = `${baseKey}|overflow-${slot.applicationId}`;
        session = undefined;
      }
    }

    if (!session) {
      session = {
        id: sessionKey,
        scheduledAt: slot.scheduledAt,
        applicantApplicationIds: [],
        interviewerIds: slot.interviewerIds.length > 0 ? [...slot.interviewerIds] : [],
        location: slot.location,
      };
      sessionMap.set(sessionKey, session);
    }

    session.applicantApplicationIds.push(slot.applicationId);

    if (slot.interviewerIds.length > session.interviewerIds.filter(Boolean).length) {
      session.interviewerIds = [...slot.interviewerIds];
    }
    if (slot.location.trim()) session.location = slot.location;
  }

  return Array.from(sessionMap.values()).sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  );
}

function sessionsToSlots(
  sessions: ScheduleSession[],
  allSlots: SlotRow[],
): SlotRow[] {
  const byApp = new Map(
    allSlots.map((s) => [
      s.applicationId,
      {
        ...s,
        scheduledAt: '',
        location: '',
        logisticsNote: '',
        groupKey: '',
        interviewerIds: [] as number[],
      },
    ]),
  );

  for (const session of sessions) {
    const time = session.scheduledAt.trim();
    if (!time) continue;

    const applicantIds = session.applicantApplicationIds.filter(
      (id): id is number => id != null,
    );
    const interviewerIds = session.interviewerIds.filter((id): id is number => id != null);
    const groupKey =
      applicantIds.length > 1
        ? `session-${session.id}`
        : `solo-${applicantIds[0] ?? session.id}`;

    for (const appId of applicantIds) {
      const row = byApp.get(appId);
      if (!row) continue;
      byApp.set(appId, {
        ...row,
        scheduledAt: time,
        location: session.location,
        groupKey,
        interviewerIds,
      });
    }
  }

  return Array.from(byApp.values());
}

const SCHEDULE_FIELD_CLASS =
  'border-border bg-popover text-foreground placeholder:text-muted-foreground';

const SCHEDULE_SECTION_LABEL_CLASS = 'text-sm font-medium text-secondary-foreground';

const SCHEDULE_STATUS_TEXT_CLASS = 'text-sm text-secondary-foreground';

function SavedIndicator() {
  return (
    <span className="inline-flex h-8 items-center px-1 text-sm font-medium text-success">
      Saved
    </span>
  );
}

function PersonSlotList({
  values,
  getOptions,
  placeholder,
  addLabel,
  maxSlots,
  showOnFocus = false,
  onChange,
  onAdd,
  onRemove,
}: {
  values: (number | null)[];
  getOptions: (currentValue: number | null) => PersonOption[];
  placeholder: string;
  addLabel: string;
  maxSlots: number;
  showOnFocus?: boolean;
  onChange: (index: number, id: number | null) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const atMax = Number.isFinite(maxSlots) && values.length >= maxSlots;

  if (values.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 justify-start px-2 text-primary hover:bg-primary/5 hover:text-primary-hover"
        onClick={onAdd}
        disabled={atMax}
      >
        {addLabel}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {values.map((personId, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <SchedulePersonInput
            value={personId}
            options={getOptions(personId)}
            placeholder={placeholder}
            showOnFocus={showOnFocus}
            onChange={(id) => onChange(idx, id)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(idx)}
          >
            ×
          </Button>
        </div>
      ))}
      {!atMax && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 justify-start px-2 text-primary hover:bg-primary/5 hover:text-primary-hover"
          onClick={onAdd}
        >
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function SortableColumnHeader({
  label,
  column,
  sortState,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortState: SortState;
  onSort: (column: SortColumn) => void;
}) {
  const active = sortState?.column === column;
  const SortIcon = active
    ? sortState.direction === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <th className="h-10 px-4 py-3 text-left text-xs font-medium tracking-wide text-secondary-foreground">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm text-secondary-foreground transition-colors hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {label}
        <SortIcon className={cn('size-3.5 shrink-0', !active && 'opacity-70')} />
      </button>
    </th>
  );
}

export function TeamInterviewScheduleEditor({
  apiPath,
  title,
  stage,
}: {
  apiPath: string;
  title: string;
  stage: 'first_round' | 'final_round';
}) {
  const router = useRouter();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [allSlots, setAllSlots] = useState<SlotRow[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingDaySettings, setSavingDaySettings] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [dayDate, setDayDate] = useState('');
  const [dayStartTime, setDayStartTime] = useState('09:00');
  const [blockMinutes, setBlockMinutes] = useState(30);
  const [scheduleBaseline, setScheduleBaseline] = useState('');
  const [daySettingsBaseline, setDaySettingsBaseline] = useState('');
  const [sortState, setSortState] = useState<SortState>(null);
  const scheduleBottomRef = useRef<HTMLDivElement>(null);
  const scrollAfterAddRef = useRef(false);

  const interviewFormat = data?.interviewFormat ?? 'individual';
  // Manual schedule editing allows up to the platform max; auto-gen still uses config.groupSize.
  const maxApplicants = maxApplicantsForFormat(
    interviewFormat,
    interviewFormat === 'group' ? MAX_INTERVIEW_GROUP_SIZE : 1,
  );

  const load = useCallback(async () => {
    const res = await fetch(apiPath);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load schedule.');
      return;
    }
    setData(json);
    setAllSlots(json.slots);
    const loaded = slotsToSessions(
      json.slots,
      json.interviewFormat,
      json.interviewFormat === 'group'
        ? MAX_INTERVIEW_GROUP_SIZE
        : (json.scheduleConfig?.groupSize ?? 4),
    );
    const loadedSessions = loaded.length > 0 ? loaded : [emptySession()];
    setSessions(loadedSessions);
    setScheduleBaseline(serializeSessionsForBaseline(loadedSessions));

    const daySnap = daySettingsFromConfig(json.scheduleConfig, stage);
    setDayDate(daySnap.dayDate);
    setDayStartTime(daySnap.dayStartTime);
    setBlockMinutes(daySnap.blockMinutes);
    setDaySettingsBaseline(serializeDaySettings(daySnap));
  }, [apiPath, router, stage]);

  useEffect(() => {
    load();
  }, [load]);

  const scheduleDirty = useMemo(
    () => scheduleBaseline !== serializeSessionsForBaseline(sessions),
    [sessions, scheduleBaseline],
  );

  const daySettingsDirty = useMemo(
    () =>
      daySettingsBaseline !== serializeDaySettings({ dayDate, dayStartTime, blockMinutes }),
    [dayDate, dayStartTime, blockMinutes, daySettingsBaseline],
  );

  const interviewDate =
    stage === 'first_round'
      ? data?.scheduleConfig.firstRoundDate
      : data?.scheduleConfig.finalRoundDate;

  const timeBlocks = data?.timeBlocks ?? [];

  const applicantOptions: PersonOption[] = useMemo(
    () =>
      allSlots.map((s) => ({
        id: s.applicationId,
        label: `${s.candidateName} (#${s.rowIndex})`,
        searchText: `${s.candidateName} ${s.rowIndex}`.toLowerCase(),
      })),
    [allSlots],
  );

  const interviewerOptions: PersonOption[] = useMemo(
    () =>
      (data?.interviewers ?? []).map((iv) => ({
        id: iv.id,
        label: iv.name,
        searchText: `${iv.name} ${iv.email}`.toLowerCase(),
      })),
    [data?.interviewers],
  );

  const usedApplicantIds = useMemo(() => {
    const ids = new Set<number>();
    for (const session of sessions) {
      for (const id of session.applicantApplicationIds) {
        if (id != null) ids.add(id);
      }
    }
    return ids;
  }, [sessions]);

  const assignedCount = usedApplicantIds.size;

  const unassignedApplicants = useMemo(
    () => applicantOptions.filter((o) => !usedApplicantIds.has(o.id)),
    [applicantOptions, usedApplicantIds],
  );

  const applicantLabelsById = useMemo(
    () => new Map(applicantOptions.map((o) => [o.id, o.label])),
    [applicantOptions],
  );

  const interviewerNamesById = useMemo(
    () => new Map((data?.interviewers ?? []).map((iv) => [iv.id, iv.name])),
    [data?.interviewers],
  );

  const displaySessions = useMemo(() => {
    if (!sortState) return sessions;

    const sorted = [...sessions];
    const { column, direction } = sortState;
    const multiplier = direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let result = 0;
      switch (column) {
        case 'time':
          result = compareSessionsByTime(a, b);
          break;
        case 'location':
          result = compareSessionsByLocation(a, b);
          break;
        case 'applicants':
          result = compareByEmptyLast(
            firstApplicantLabel(a, applicantLabelsById),
            firstApplicantLabel(b, applicantLabelsById),
          );
          break;
        case 'interviewers':
          result = compareByEmptyLast(
            firstInterviewerName(a, interviewerNamesById),
            firstInterviewerName(b, interviewerNamesById),
          );
          break;
      }
      if (result === 0) return 0;
      return result * multiplier;
    });
    return sorted;
  }, [sessions, sortState, applicantLabelsById, interviewerNamesById]);

  const handleColumnSort = (column: SortColumn) => {
    setSortState((prev) => {
      if (prev?.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  };

  const timeLabelsByScheduledAt = useMemo(
    () => new Map(timeBlocks.map((block) => [block.scheduledAt, block.label])),
    [timeBlocks],
  );

  const scheduleValidation = useMemo(
    () =>
      validateInterviewerAssignments(
        assignmentsFromUiSessions(sessions),
        interviewerNamesById,
        timeLabelsByScheduledAt,
      ),
    [sessions, interviewerNamesById, timeLabelsByScheduledAt],
  );

  const conflictSessionIds = useMemo(
    () => new Set(scheduleValidation.conflictSessionKeys),
    [scheduleValidation.conflictSessionKeys],
  );

  const applicantOptionsForPicker = useCallback(
    (currentValue: number | null) =>
      applicantOptions.filter((o) => !usedApplicantIds.has(o.id) || o.id === currentValue),
    [applicantOptions, usedApplicantIds],
  );

  const interviewerOptionsForPicker = useCallback(
    (sessionInterviewerIds: (number | null)[], currentValue: number | null) =>
      interviewerOptions.filter(
        (o) =>
          o.id === currentValue ||
          !sessionInterviewerIds.some((id) => id === o.id),
      ),
    [interviewerOptions],
  );

  const updateSession = (id: string, patch: Partial<ScheduleSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : [emptySession()];
    });
  };

  const addSession = () => {
    scrollAfterAddRef.current = true;
    setSessions((prev) => [...prev, emptySession()]);
  };

  useEffect(() => {
    if (!scrollAfterAddRef.current) return;
    scrollAfterAddRef.current = false;
    scheduleBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sessions.length]);

  const saveDaySettings = async () => {
    setSavingDaySettings(true);
    setError('');

    const res = await fetch(apiPath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interviewDate: dayDate || null,
        startTime: dayStartTime,
        blockMinutes,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      const message = json.error ?? 'Failed to save interview day settings.';
      setError(message);
      toast.error(message);
    } else {
      toast.success('Interview day updated');
      if (json.scheduleConfig) {
        setData((prev) => (prev ? { ...prev, scheduleConfig: json.scheduleConfig, timeBlocks: json.timeBlocks ?? prev.timeBlocks } : prev));
        const daySnap = daySettingsFromConfig(json.scheduleConfig, stage);
        setDayDate(daySnap.dayDate);
        setDayStartTime(daySnap.dayStartTime);
        setBlockMinutes(daySnap.blockMinutes);
        setDaySettingsBaseline(serializeDaySettings(daySnap));
      } else {
        await load();
      }
    }
    setSavingDaySettings(false);
  };

  const setApplicant = (sessionId: string, slotIndex: number, applicationId: number | null) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const next = [...s.applicantApplicationIds];
        if (slotIndex >= next.length) next.push(applicationId);
        else next[slotIndex] = applicationId;
        return { ...s, applicantApplicationIds: next };
      }),
    );
  };

  const addApplicantSlot = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        if (s.applicantApplicationIds.length >= maxApplicants) return s;
        return { ...s, applicantApplicationIds: [...s.applicantApplicationIds, null] };
      }),
    );
  };

  const removeApplicantSlot = (sessionId: string, slotIndex: number) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          applicantApplicationIds: s.applicantApplicationIds.filter((_, i) => i !== slotIndex),
        };
      }),
    );
  };

  const setInterviewer = (sessionId: string, slotIndex: number, userId: number | null) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const next = [...s.interviewerIds];
        if (slotIndex >= next.length) next.push(userId);
        else next[slotIndex] = userId;
        return { ...s, interviewerIds: next };
      }),
    );
  };

  const addInterviewerSlot = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, interviewerIds: [...s.interviewerIds, null] } : s,
      ),
    );
  };

  const removeInterviewerSlot = (sessionId: string, slotIndex: number) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, interviewerIds: s.interviewerIds.filter((_, i) => i !== slotIndex) };
      }),
    );
  };

  const buildSlotsPayload = (nextSessions: ScheduleSession[]) =>
    sessionsToSlots(nextSessions, allSlots).map((s) => ({
      applicationId: s.applicationId,
      scheduledAt: s.scheduledAt,
      location: s.location,
      logisticsNote: '',
      groupKey: s.groupKey,
      interviewerIds: s.interviewerIds,
    }));

  const persistSessions = async (
    nextSessions: ScheduleSession[],
    successMessage: string,
    options?: { skipConflictCheck?: boolean },
  ): Promise<boolean> => {
    if (!options?.skipConflictCheck) {
      const validation = validateInterviewerAssignments(
        assignmentsFromUiSessions(nextSessions),
        interviewerNamesById,
        timeLabelsByScheduledAt,
      );
      if (validation.error) {
        const message = validation.messages.join(' ');
        setError(message);
        toast.error(validation.error);
        return false;
      }
    }

    setSaving(true);
    setError('');

    const res = await fetch(apiPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots: buildSlotsPayload(nextSessions) }),
    });
    const json = await res.json();
    if (!res.ok) {
      const message = json.error ?? 'Failed to save schedule.';
      setError(message);
      toast.error(message);
      setSaving(false);
      return false;
    }

    setAllSlots(sessionsToSlots(nextSessions, allSlots));
    setScheduleBaseline(serializeSessionsForBaseline(nextSessions));
    toast.success(successMessage);
    setSaving(false);
    return true;
  };

  const clearAllApplicants = async () => {
    const clearedSessions = sessions.map((s) => ({
      ...s,
      applicantApplicationIds: [] as (number | null)[],
    }));
    setSessions(clearedSessions);
    await persistSessions(clearedSessions, 'All applicants cleared', {
      skipConflictCheck: true,
    });
  };

  const handleSimulateSchedule = async () => {
    setSimulating(true);
    setError('');
    try {
      const res = await fetch(`${apiPath}/simulate`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (json.error as string) ?? 'Failed to simulate schedule.';
        setError(message);
        toast.error(message);
        return;
      }
      const sessionsCreated = (json.sessionsCreated as number) ?? 0;
      const slotsAssigned = (json.slotsAssigned as number) ?? 0;
      toast.success(
        `Simulated schedule: ${sessionsCreated} interview${sessionsCreated === 1 ? '' : 's'} for ${slotsAssigned} applicant${slotsAssigned === 1 ? '' : 's'}`,
      );
      await load();
    } catch {
      const message = 'Network error while simulating schedule.';
      setError(message);
      toast.error(message);
    } finally {
      setSimulating(false);
    }
  };

  const handleSave = async () => {
    const ok = await persistSessions(sessions, 'Schedule saved');
    if (!ok) return;

    const res = await fetch(apiPath);
    if (res.ok) {
      const json = await res.json();
      const loaded = slotsToSessions(
        json.slots,
        json.interviewFormat,
        json.interviewFormat === 'group'
          ? MAX_INTERVIEW_GROUP_SIZE
          : (json.scheduleConfig?.groupSize ?? 4),
      );
      const nextSessions =
        loaded.length > 0
          ? loaded
          : sessions.length > 0
            ? sessions.map((s) => ({ ...s, applicantApplicationIds: [] as (number | null)[] }))
            : [emptySession()];
      setSessions(nextSessions);
      setAllSlots(json.slots);
      setScheduleBaseline(serializeSessionsForBaseline(nextSessions));
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

  return (
    <PageContainer size="wide">
      <PageSection>
      <PageHeader
        eyebrow={data.team.name}
        title={title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatLabel(interviewFormat)}</Badge>
            <Link
              href={`/admin/teams/${data.team.id}/interview-setup`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Interview Setup →
            </Link>
          </div>
        }
      />

      {error && <StatusBanner message={error} type="error" />}
      {data.round.status === 'closed' && (
        <StatusBanner
          type="info"
          message="Recruitment is closed. Teams are view-only, and you can still edit this schedule."
        />
      )}

      <Card data-tour="schedule-day">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="text-foreground">Interview Day</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="interview-date" className="text-foreground" required>
                Date
              </Label>
              <Input
                id="interview-date"
                type="date"
                className={SCHEDULE_FIELD_CLASS}
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interview-start" className="text-foreground" required>
                First block starts
              </Label>
              <Input
                id="interview-start"
                type="time"
                className={SCHEDULE_FIELD_CLASS}
                value={dayStartTime}
                onChange={(e) => setDayStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-minutes" className="text-foreground" required>
                Block length (minutes)
              </Label>
              <NumberDraftInput
                id="block-minutes"
                integer
                min={15}
                max={120}
                className={SCHEDULE_FIELD_CLASS}
                value={blockMinutes}
                onCommit={setBlockMinutes}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/50 pt-3">
            {interviewDate && timeBlocks.length > 0 && (
              <p className={cn('mr-auto', SCHEDULE_STATUS_TEXT_CLASS)}>
                {assignedCount}/{allSlots.length} applicants scheduled
              </p>
            )}
            {daySettingsDirty || savingDaySettings ? (
              <LoadingButton
                size="sm"
                variant="primary"
                loading={savingDaySettings}
                disabled={!daySettingsDirty || savingDaySettings}
                onClick={() => void saveDaySettings()}
              >
                {saveButtonLabel(savingDaySettings, daySettingsDirty, 'Save interview day')}
              </LoadingButton>
            ) : (
              <SavedIndicator />
            )}
          </div>
        </CardContent>
      </Card>

      <PageSection>
        <Card className="overflow-hidden" data-tour="schedule-editor">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/50">
            <CardTitle className="flex items-baseline gap-2.5 text-foreground">
              Schedule
              <TitleCount>
                {allSlots.length} applicant{allSlots.length === 1 ? '' : 's'}
              </TitleCount>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {allSlots.length > 0 && (
                <DestructiveConfirmDialog
                  title="Simulate Schedule?"
                  description={
                    <>
                      Auto-fills a complete interview schedule for testing: assigns applicants
                      into {interviewFormat === 'group' ? 'group' : 'individual'} slots and
                      rotates available interviewers.
                      <br />
                      <br />
                      {assignedCount > 0
                        ? 'This replaces the current schedule for this stage.'
                        : 'If no interview date is set, one will be chosen automatically.'}
                    </>
                  }
                  confirmLabel="Simulate Schedule"
                  onConfirm={handleSimulateSchedule}
                  trigger={
                    <LoadingButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="border border-border bg-popover text-foreground uma-hover-on-panel hover:text-foreground"
                      disabled={saving || simulating}
                      data-tour="schedule-simulate"
                    />
                  }
                  triggerLabel="Simulate Schedule"
                />
              )}
              {assignedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border text-foreground"
                  disabled={saving || simulating}
                  onClick={() => void clearAllApplicants()}
                >
                  Clear All Applicants
                </Button>
              )}
            </div>
          </CardHeader>
          {allSlots.length > 0 && (
            <div
              className="border-b border-border/50 bg-muted/20 px-4 py-3"
              data-tour="schedule-assign"
            >
              <p className={cn('mb-2 flex items-baseline gap-2.5', SCHEDULE_SECTION_LABEL_CLASS)}>
                Unassigned Applicants
                <TitleCount>{unassignedApplicants.length}</TitleCount>
              </p>
              {unassignedApplicants.length === 0 ? (
                <p className={SCHEDULE_STATUS_TEXT_CLASS}>All applicants are scheduled.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {unassignedApplicants.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-md border border-border bg-popover px-2 py-0.5 text-sm font-medium text-foreground"
                    >
                      {a.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {allSlots.length > 0 && scheduleValidation.messages.length > 0 && (
            <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">Scheduling Conflicts</p>
              <p className="mt-1 text-sm text-destructive/90">
                Fix the highlighted rows before saving.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-destructive">
                {scheduleValidation.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          <CardContent className="overflow-x-auto p-0">
            {allSlots.length === 0 ? (
              <p className={cn('p-4', SCHEDULE_STATUS_TEXT_CLASS)}>
                No applicants in this round yet. Advance applicants first.
              </p>
            ) : (
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <SortableColumnHeader
                      label="Time"
                      column="time"
                      sortState={sortState}
                      onSort={handleColumnSort}
                    />
                    <SortableColumnHeader
                      label="Applicants"
                      column="applicants"
                      sortState={sortState}
                      onSort={handleColumnSort}
                    />
                    <SortableColumnHeader
                      label="Interviewers"
                      column="interviewers"
                      sortState={sortState}
                      onSort={handleColumnSort}
                    />
                    <SortableColumnHeader
                      label="Location"
                      column="location"
                      sortState={sortState}
                      onSort={handleColumnSort}
                    />
                    <th className="h-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {displaySessions.map((session) => (
                    <tr
                      key={session.id}
                      className={cn(
                        'align-top',
                        conflictSessionIds.has(session.id) &&
                          'bg-destructive/5 ring-2 ring-inset ring-destructive/40',
                      )}
                    >
                      <td className="p-3">
                        <NativeSelect
                          value={session.scheduledAt}
                          disabled={!interviewDate || timeBlocks.length === 0}
                          className={cn('h-8 w-full', SCHEDULE_FIELD_CLASS)}
                          onChange={(e) =>
                            updateSession(session.id, { scheduledAt: e.target.value })
                          }
                        >
                          <option value="">Pick time…</option>
                          {timeBlocks.map((block) => (
                            <option key={block.scheduledAt} value={block.scheduledAt}>
                              {block.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                      <td className="p-3">
                        <PersonSlotList
                          values={session.applicantApplicationIds}
                          getOptions={applicantOptionsForPicker}
                          placeholder="Applicant"
                          addLabel="+ Add applicant"
                          maxSlots={maxApplicants}
                          showOnFocus
                          onChange={(idx, id) => setApplicant(session.id, idx, id)}
                          onAdd={() => addApplicantSlot(session.id)}
                          onRemove={(idx) => removeApplicantSlot(session.id, idx)}
                        />
                      </td>
                      <td className="p-3">
                        <PersonSlotList
                          values={session.interviewerIds}
                          getOptions={(currentId) =>
                            interviewerOptionsForPicker(session.interviewerIds, currentId)
                          }
                          placeholder="Interviewer"
                          addLabel="+ Add interviewer"
                          maxSlots={Number.POSITIVE_INFINITY}
                          onChange={(idx, id) => setInterviewer(session.id, idx, id)}
                          onAdd={() => addInterviewerSlot(session.id)}
                          onRemove={(idx) => removeInterviewerSlot(session.id, idx)}
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          value={session.location}
                          onChange={(e) =>
                            updateSession(session.id, { location: e.target.value })
                          }
                          placeholder="Room / Zoom link"
                          className={cn('h-8 w-full text-sm', SCHEDULE_FIELD_CLASS)}
                        />
                      </td>
                      <td className="p-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-foreground hover:text-destructive"
                          onClick={() => removeSession(session.id)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
          {allSlots.length > 0 && (
            <div
              ref={scheduleBottomRef}
              className="flex flex-wrap items-center justify-end gap-2 border-t border-border/50 px-4 py-3"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border text-foreground"
                onClick={addSession}
              >
                Add interview slot
              </Button>
              {scheduleDirty || saving ? (
                <LoadingButton
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={
                    !scheduleDirty || saving || scheduleValidation.messages.length > 0
                  }
                  data-tour="schedule-save"
                >
                  {saveButtonLabel(saving, scheduleDirty, 'Save schedule')}
                </LoadingButton>
              ) : (
                <span data-tour="schedule-save">
                  <SavedIndicator />
                </span>
              )}
            </div>
          )}
        </Card>
      </PageSection>
      </PageSection>
    </PageContainer>
  );
}
