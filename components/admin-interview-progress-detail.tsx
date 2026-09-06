'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import { phaseLabel } from '@/lib/stages';
import type { InterviewSlotStage } from '@/lib/interview-slots';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  groupAssignmentsIntoSessions,
  sessionKeyForAssignment,
} from '@/lib/interview-sessions';
import { cn } from '@/lib/utils';

interface InterviewerProgress {
  userId: number;
  name: string;
  total: number;
  completed: number;
  pending: number;
}

interface SlotInterviewer {
  userId: number;
  name: string;
}

interface SlotProgress {
  slotId: number;
  applicationId: number;
  candidateName: string;
  rowIndex: number;
  scheduledAt: string;
  location: string;
  groupKey: string | null;
  interviewerCount: number;
  scoredCount: number;
  complete: boolean;
  interviewers: SlotInterviewer[];
}

interface InterviewProgressData {
  stage: InterviewSlotStage;
  summary: {
    candidateCount: number;
    slotCount: number;
    total: number;
    completed: number;
  };
  byInterviewer: InterviewerProgress[];
  bySlot: SlotProgress[];
}

type SessionStatus = 'scheduled' | 'in_progress' | 'completed';

interface SessionGroup {
  key: string;
  scheduledAt: string;
  location: string;
  isGroup: boolean;
  slots: SlotProgress[];
  interviewerCount: number;
  scoredCount: number;
  interviewers: SlotInterviewer[];
}

interface TimeBlockGroup {
  key: string;
  scheduledAt: string;
  location: string;
  sessions: SessionGroup[];
}

function formatCompactTime(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return scheduledAt;
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDayHeader(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return scheduledAt;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function dayKeyForSession(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return scheduledAt;
  // Local calendar day — must match formatDayHeader (toLocaleDateString), not UTC.
  // Otherwise evening slots after UTC midnight get a duplicate same-looking day header.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function groupSlotsIntoSessions(slots: SlotProgress[]): SessionGroup[] {
  const slotByAppId = new Map(slots.map((slot) => [slot.applicationId, slot]));
  const sessionGroups = groupAssignmentsIntoSessions(
    slots.map((slot) => ({
      applicationId: slot.applicationId,
      groupKey: slot.groupKey,
      scheduledAt: slot.scheduledAt,
      location: slot.location,
    })),
  );

  return sessionGroups.map((group) => {
    const groupSlots = group.map((entry) => slotByAppId.get(entry.applicationId)!);
    const first = groupSlots[0];
    const key = sessionKeyForAssignment({
      applicationId: first.applicationId,
      groupKey: first.groupKey,
      scheduledAt: first.scheduledAt,
      location: first.location,
    });
    const isGroup = groupSlots.length > 1 || Boolean(first.groupKey?.trim());
    const interviewersById = new Map<number, SlotInterviewer>();
    for (const slot of groupSlots) {
      for (const interviewer of slot.interviewers ?? []) {
        if (!interviewersById.has(interviewer.userId)) {
          interviewersById.set(interviewer.userId, interviewer);
        }
      }
    }
    const interviewers = Array.from(interviewersById.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return {
      key,
      scheduledAt: first.scheduledAt,
      location: first.location,
      isGroup,
      slots: groupSlots,
      interviewerCount: groupSlots.reduce((sum, slot) => sum + slot.interviewerCount, 0),
      scoredCount: groupSlots.reduce((sum, slot) => sum + slot.scoredCount, 0),
      interviewers,
    };
  });
}

function getSessionStatus(session: SessionGroup): SessionStatus {
  if (session.interviewerCount === 0) return 'scheduled';
  if (session.scoredCount >= session.interviewerCount) return 'completed';
  if (session.scoredCount > 0) return 'in_progress';

  const scheduledAt = new Date(session.scheduledAt);
  if (!Number.isNaN(scheduledAt.getTime()) && scheduledAt > new Date()) {
    return 'scheduled';
  }
  return 'in_progress';
}

function timeBlockKeyForSession(session: SessionGroup): string {
  return `${session.scheduledAt}|${session.location}`;
}

function groupSessionsByTimeBlock(sessions: SessionGroup[]): TimeBlockGroup[] {
  const byBlock = new Map<string, TimeBlockGroup>();

  for (const session of sessions) {
    const key = timeBlockKeyForSession(session);
    const existing = byBlock.get(key);
    if (existing) {
      existing.sessions.push(session);
      continue;
    }
    byBlock.set(key, {
      key,
      scheduledAt: session.scheduledAt,
      location: session.location,
      sessions: [session],
    });
  }

  return Array.from(byBlock.values());
}

function groupSessionsByDay(
  sessions: SessionGroup[],
): { dayKey: string; dayLabel: string; timeBlocks: TimeBlockGroup[] }[] {
  const byDay = new Map<string, SessionGroup[]>();

  for (const session of sessions) {
    const dayKey = dayKeyForSession(session.scheduledAt);
    const existing = byDay.get(dayKey) ?? [];
    existing.push(session);
    byDay.set(dayKey, existing);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, daySessions]) => {
      const sortedSessions = [...daySessions].sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
      const timeBlocks = groupSessionsByTimeBlock(sortedSessions).sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );

      return {
        dayKey,
        dayLabel: formatDayHeader(sortedSessions[0].scheduledAt),
        timeBlocks,
      };
    });
}

const statusAccent = {
  completed: {
    border: 'border-l-emerald-500/70',
    dot: 'bg-emerald-500',
    ring: 'text-emerald-600',
    ringTrack: 'text-emerald-500/20',
    score: 'text-emerald-700',
  },
  in_progress: {
    border: 'border-l-amber-400/80',
    dot: 'bg-amber-400',
    ring: 'text-amber-500',
    ringTrack: 'text-amber-500/20',
    score: 'text-foreground',
  },
  scheduled: {
    border: 'border-l-sky-400/60',
    dot: 'bg-sky-400/80',
    ring: 'text-sky-500',
    ringTrack: 'text-sky-500/20',
    score: 'text-foreground',
  },
} as const;

function MicroProgressRing({
  value,
  max,
  className,
  trackClassName,
}: {
  value: number;
  max: number;
  className?: string;
  trackClassName?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 7;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <svg
      className="size-[18px] shrink-0 -rotate-90"
      viewBox="0 0 18 18"
      aria-hidden
    >
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2"
        className={cn('stroke-current', trackClassName)}
      />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        className={cn('stroke-current transition-[stroke-dashoffset]', className)}
      />
    </svg>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

const SESSION_META_CHIP_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground';

const SESSION_CARD_CLASS =
  'w-full min-w-[14rem] max-w-[19rem] shrink-0 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 sm:w-[19rem]';

const SESSION_CARD_BODY_CLASS = 'flex h-full flex-col justify-center gap-2';

/** Internal section dividers — one step stronger than border/40 so rows stay readable. */
const SECTION_BORDER = 'border-border/65';
const SECTION_ROW_BORDER = 'border-border/55';

function SessionMetaChip({
  names,
  label,
  icon: Icon,
}: {
  names: string[];
  label: string;
  icon: typeof UsersIcon;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          SESSION_META_CHIP_CLASS,
          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        render={<button type="button" />}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="flex w-48 max-w-[var(--available-width)] flex-col items-start gap-1 px-3 py-2"
      >
        <ul className="w-full space-y-1 text-background/90">
          {names.map((name, index) => (
            <li key={`${name}-${index}`} className="truncate leading-snug">
              {name}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function SessionInterviewersControl({ session }: { session: SessionGroup }) {
  const interviewers = session.interviewers;
  const count = interviewers.length;

  if (count === 0) {
    return (
      <span className={SESSION_META_CHIP_CLASS}>
        <UserCheckIcon className="size-3.5 shrink-0" aria-hidden />
        No interviewers
      </span>
    );
  }

  return (
    <SessionMetaChip
      icon={UserCheckIcon}
      label={count === 1 ? '1 Interviewer' : `${count} Interviewers`}
      names={interviewers.map((interviewer) => interviewer.name)}
    />
  );
}

function SessionCandidateSummary({ session }: { session: SessionGroup }) {
  const names = session.slots.map((slot) => slot.candidateName);
  const count = names.length;

  if (count === 0) {
    return (
      <span className={SESSION_META_CHIP_CLASS}>
        <UsersIcon className="size-3.5 shrink-0" aria-hidden />
        No applicants
      </span>
    );
  }

  return (
    <SessionMetaChip
      icon={UsersIcon}
      label={count === 1 ? '1 Applicant' : `${count} Applicants`}
      names={names}
    />
  );
}

function getAggregateSessionStatus(sessions: SessionGroup[]): SessionStatus {
  if (sessions.length === 0) return 'scheduled';
  const statuses = sessions.map(getSessionStatus);
  if (statuses.every((s) => s === 'completed')) return 'completed';
  if (statuses.some((s) => s === 'in_progress' || s === 'completed')) return 'in_progress';
  return 'scheduled';
}

function SessionStatusCompact({ session }: { session: SessionGroup }) {
  const status = getSessionStatus(session);
  const hasInterviewers = session.interviewerCount > 0;
  const statusLabel =
    status === 'completed'
      ? 'Completed'
      : status === 'in_progress'
        ? 'In progress'
        : 'Scheduled';
  const scoreLabel = `${session.scoredCount}/${session.interviewerCount}`;
  const accent = statusAccent[status];

  if (!hasInterviewers) {
    return null;
  }

  if (status === 'completed') {
    return (
      <div
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        aria-label={`${statusLabel}: ${session.scoredCount} of ${session.interviewerCount} scored`}
      >
        <CheckIcon className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
        <StageBadge label="Completed" color="green" size="compact" />
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {scoreLabel}
        </span>
      </div>
    );
  }

  if (status === 'in_progress') {
    return (
      <div
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        aria-label={`${statusLabel}: ${session.scoredCount} of ${session.interviewerCount} scored`}
      >
        <MicroProgressRing
          value={session.scoredCount}
          max={session.interviewerCount}
          className={accent.ring}
          trackClassName={accent.ringTrack}
        />
        <span className="text-sm font-medium text-amber-800/90">In progress</span>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {scoreLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      aria-label={`${statusLabel}: ${session.scoredCount} of ${session.interviewerCount} scored`}
    >
      <div className={cn('size-2 shrink-0 rounded-full', accent.dot)} />
      <span className="text-sm font-medium text-sky-700/90">Scheduled</span>
      <span className="text-sm tabular-nums text-muted-foreground">{scoreLabel}</span>
    </div>
  );
}

const SESSION_TIMELINE_GRID =
  'grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)]';

function SessionInterviewCell({
  session,
  index,
}: {
  session: SessionGroup;
  index: number;
}) {
  return (
    <div
      className={cn(
        SESSION_CARD_BODY_CLASS,
        SESSION_CARD_CLASS,
      )}
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          Interview {index + 1}
        </span>
        <SessionInterviewersControl session={session} />
        <SessionCandidateSummary session={session} />
      </div>
      <div className="flex min-h-[1.25rem] items-center">
        <SessionStatusCompact session={session} />
      </div>
    </div>
  );
}

function TimeBlockTimelineRow({ block }: { block: TimeBlockGroup }) {
  const blockStatus = getAggregateSessionStatus(block.sessions);
  const accent = statusAccent[blockStatus];

  return (
    <div className={cn(SESSION_TIMELINE_GRID, 'items-center')}>
      <div className={cn('flex items-center gap-2 self-center px-3 py-3 sm:border-r sm:px-4', SECTION_BORDER)}>
        <div
          className={cn(
            'size-2 shrink-0 rounded-full ring-2 ring-card',
            accent.dot,
          )}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums leading-tight text-foreground">
            {formatCompactTime(block.scheduledAt)}
          </p>
          {block.location ? (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-sm">
              {block.location}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 px-3 py-3 sm:px-4">
        <div className="flex w-full min-w-0 flex-wrap gap-3">
          {block.sessions.map((session, index) => (
            <SessionInterviewCell
              key={session.key}
              session={session}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function buildSessionStatePreviewGroups(): SessionGroup[] {
  const now = new Date();

  const parallelAt = new Date(now);
  parallelAt.setDate(parallelAt.getDate() + 1);
  parallelAt.setHours(10, 0, 0, 0);

  const soloScheduledAt = new Date(now);
  soloScheduledAt.setDate(soloScheduledAt.getDate() + 1);
  soloScheduledAt.setHours(14, 0, 0, 0);

  const parallelLoc = 'SOCS 212';
  const soloLoc = 'Preview Room A';

  const completedGroupSlots: SlotProgress[] = [
    {
      slotId: -1,
      applicationId: -1,
      candidateName: 'Jordan Lee',
      rowIndex: 1,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-a',
      interviewerCount: 2,
      scoredCount: 2,
      complete: true,
      interviewers: [
        { userId: 101, name: 'Morgan Blake' },
        { userId: 102, name: 'Chris Avery' },
      ],
    },
    {
      slotId: -2,
      applicationId: -2,
      candidateName: 'Sam Park',
      rowIndex: 2,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-a',
      interviewerCount: 2,
      scoredCount: 2,
      complete: true,
      interviewers: [
        { userId: 101, name: 'Morgan Blake' },
        { userId: 102, name: 'Chris Avery' },
      ],
    },
    {
      slotId: -3,
      applicationId: -3,
      candidateName: 'Riley Nguyen',
      rowIndex: 3,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-a',
      interviewerCount: 2,
      scoredCount: 2,
      complete: true,
      interviewers: [
        { userId: 101, name: 'Morgan Blake' },
        { userId: 102, name: 'Chris Avery' },
      ],
    },
    {
      slotId: -4,
      applicationId: -4,
      candidateName: 'Casey Ortiz',
      rowIndex: 4,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-a',
      interviewerCount: 2,
      scoredCount: 2,
      complete: true,
      interviewers: [
        { userId: 101, name: 'Morgan Blake' },
        { userId: 102, name: 'Chris Avery' },
      ],
    },
  ];

  const inProgressSoloSlot: SlotProgress = {
    slotId: -5,
    applicationId: -5,
    candidateName: 'Alex Chen',
    rowIndex: 5,
    scheduledAt: parallelAt.toISOString(),
    location: parallelLoc,
    groupKey: null,
    interviewerCount: 4,
    scoredCount: 2,
    complete: false,
    interviewers: [
      { userId: 201, name: 'Dana Kim' },
      { userId: 202, name: 'Ellis Tran' },
      { userId: 203, name: 'Frankie Soto' },
      { userId: 204, name: 'Harper Lin' },
    ],
  };

  const scheduledGroupSlots: SlotProgress[] = [
    {
      slotId: -7,
      applicationId: -7,
      candidateName: 'Taylor Reed',
      rowIndex: 7,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-c',
      interviewerCount: 2,
      scoredCount: 0,
      complete: false,
      interviewers: [
        { userId: 301, name: 'Jamie Cole' },
        { userId: 302, name: 'Kai Rivera' },
      ],
    },
    {
      slotId: -8,
      applicationId: -8,
      candidateName: 'Quinn Hayes',
      rowIndex: 8,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-c',
      interviewerCount: 2,
      scoredCount: 0,
      complete: false,
      interviewers: [
        { userId: 301, name: 'Jamie Cole' },
        { userId: 302, name: 'Kai Rivera' },
      ],
    },
    {
      slotId: -9,
      applicationId: -9,
      candidateName: 'Drew Patel',
      rowIndex: 9,
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      groupKey: 'preview-group-c',
      interviewerCount: 2,
      scoredCount: 0,
      complete: false,
      interviewers: [
        { userId: 301, name: 'Jamie Cole' },
        { userId: 302, name: 'Kai Rivera' },
      ],
    },
  ];

  const soloScheduledSlot: SlotProgress = {
    slotId: -11,
    applicationId: -11,
    candidateName: 'Jamie Wu',
    rowIndex: 11,
    scheduledAt: soloScheduledAt.toISOString(),
    location: soloLoc,
    groupKey: null,
    interviewerCount: 3,
    scoredCount: 0,
    complete: false,
    interviewers: [
      { userId: 401, name: 'Noah Patel' },
      { userId: 402, name: 'Olivia Chen' },
      { userId: 403, name: 'Priya Shah' },
    ],
  };

  return [
    {
      key: 'preview-session-completed-group',
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      isGroup: true,
      slots: completedGroupSlots,
      interviewerCount: 8,
      scoredCount: 8,
      interviewers: [
        { userId: 101, name: 'Morgan Blake' },
        { userId: 102, name: 'Chris Avery' },
      ],
    },
    {
      key: 'preview-session-in-progress-solo',
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      isGroup: false,
      slots: [inProgressSoloSlot],
      interviewerCount: 4,
      scoredCount: 2,
      interviewers: inProgressSoloSlot.interviewers,
    },
    {
      key: 'preview-session-scheduled-group',
      scheduledAt: parallelAt.toISOString(),
      location: parallelLoc,
      isGroup: true,
      slots: scheduledGroupSlots,
      interviewerCount: 6,
      scoredCount: 0,
      interviewers: [
        { userId: 301, name: 'Jamie Cole' },
        { userId: 302, name: 'Kai Rivera' },
      ],
    },
    {
      key: 'preview-session-solo-scheduled',
      scheduledAt: soloScheduledAt.toISOString(),
      location: soloLoc,
      isGroup: false,
      slots: [soloScheduledSlot],
      interviewerCount: 3,
      scoredCount: 0,
      interviewers: soloScheduledSlot.interviewers,
    },
  ];
}

function SessionStatePreviewBanner() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-violet-300/80 bg-violet-500/5 px-3 py-2">
      <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-900">
        Preview
      </span>
      <p className="text-sm text-muted-foreground">
        Sample session timeline states for design review — not real interview data.
      </p>
    </div>
  );
}

function SessionTimelineLegend() {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
      aria-label="Session status legend"
    >
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckIcon className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
        <span className="font-medium text-foreground">Completed</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <MicroProgressRing
          value={1}
          max={2}
          className={statusAccent.in_progress.ring}
          trackClassName={statusAccent.in_progress.ringTrack}
        />
        <span className="font-medium text-foreground">In progress</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span
          className={cn('size-2 shrink-0 rounded-full', statusAccent.scheduled.dot)}
          aria-hidden
        />
        <span className="font-medium text-foreground">Scheduled</span>
      </span>
      <Tooltip>
        <TooltipTrigger
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          render={<button type="button" />}
        >
          <span className="rounded bg-muted/50 px-1 py-px font-medium tabular-nums text-muted-foreground/80">
            n/n
          </span>
          <span className="font-medium text-foreground">Interviewer Scores</span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[min(14rem,var(--available-width))] text-center"
        >
          Submitted interviewer scores divided by expected scores, shown on the second line of
          each session.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function SessionTimeline({ sessions }: { sessions: SessionGroup[] }) {
  const dayGroups = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const showDayHeaders = dayGroups.length > 1;
  let blockIndex = 0;

  return (
    <div className={cn('overflow-x-auto rounded-lg border', SECTION_BORDER)}>
      <div
        className={cn(
          SESSION_TIMELINE_GRID,
          'border-b bg-muted/30',
          SECTION_BORDER,
        )}
      >
        <div className="h-10 px-3 py-3 text-xs font-medium tracking-wide text-muted-foreground sm:px-4">
          Time
        </div>
        <div className="h-10 px-3 py-3 text-xs font-medium tracking-wide text-muted-foreground sm:px-4">
          Sessions
        </div>
      </div>
      {dayGroups.map((day) => (
        <div key={day.dayKey}>
          {showDayHeaders ? (
            <div className={cn('flex items-center gap-2 border-b bg-muted/20 px-4 py-3', SECTION_BORDER)}>
              <CalendarDaysIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">{day.dayLabel}</p>
            </div>
          ) : null}
          {day.timeBlocks.map((block) => {
            blockIndex += 1;
            return (
              <div
                key={block.key}
                className={cn(
                  'border-b last:border-b-0',
                  SECTION_BORDER,
                  blockIndex % 2 === 0 && 'bg-muted/15',
                )}
              >
                <TimeBlockTimelineRow block={block} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AdminInterviewProgressDetail({
  teamId,
  stage,
  defaultDetailOpen = true,
  sessionStatePreview = false,
}: {
  teamId: string | number;
  stage: InterviewSlotStage;
  /** When true, interviewer/session breakdown starts expanded. */
  defaultDetailOpen?: boolean;
  /** Dev preview: sample Scheduled / In progress / Completed session rows. */
  sessionStatePreview?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<InterviewProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(defaultDetailOpen);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/teams/${teamId}/interview-progress?stage=${stage}`,
        { cache: 'no-store' },
      );
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load interview progress.');
        return;
      }
      setData(json.progress as InterviewProgressData);
    } catch {
      setError('Failed to load interview progress.');
    } finally {
      setLoading(false);
    }
  }, [router, stage, teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <PageLoading />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const { summary, byInterviewer, bySlot } = data;

  if (summary.candidateCount === 0 && !sessionStatePreview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{phaseLabel(stage)}</CardTitle>
          <CardDescription>No candidates in this phase yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Advance applicants from the previous phase, or set up the interview schedule while
            you wait.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sessions = groupSlotsIntoSessions(bySlot);
  const previewSessions = sessionStatePreview ? buildSessionStatePreviewGroups() : [];
  const allScored = summary.total > 0 && summary.completed === summary.total;
  const pendingSessions = sessions.filter(
    (session) =>
      session.interviewerCount > 0 && getSessionStatus(session) !== 'completed',
  );
  const pendingInterviewers = byInterviewer.filter((i) => i.pending > 0);

  const statusBadges = (
    <div className="flex flex-wrap gap-2">
      {allScored && summary.total > 0 ? (
        <StageBadge label="All scored" color="green" size="compact" />
      ) : pendingInterviewers.length > 0 ? (
        <StageBadge
          label={`${pendingInterviewers.length} interviewer${pendingInterviewers.length === 1 ? '' : 's'} pending`}
          color="yellow"
          size="compact"
        />
      ) : null}
      {pendingSessions.length > 0 && (
        <StageBadge
          label={`${pendingSessions.length} session${pendingSessions.length === 1 ? '' : 's'} incomplete`}
          color="orange"
          size="compact"
        />
      )}
    </div>
  );

  const breakdown = (
    <div className="space-y-5">
      <div>
        <SectionHeader>By Interviewer</SectionHeader>
        {byInterviewer.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interview assignments yet.</p>
        ) : (
          <div className={cn('overflow-x-auto rounded-lg border', SECTION_BORDER)}>
            <Table className="table-fixed">
              <colgroup>
                <col style={{ width: '50%' }} />
                <col style={{ width: '50%' }} />
              </colgroup>
              <TableHeader>
                <TableRow className={cn('bg-muted/30 hover:bg-muted/30', SECTION_BORDER)}>
                  <TableHead className="h-10 px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground">
                    Interviewer
                  </TableHead>
                  <TableHead className="h-10 px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground">
                    Progress
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byInterviewer.map((iv, index) => {
                  const done = iv.pending === 0 && iv.total > 0;
                  return (
                    <TableRow
                      key={iv.userId}
                      className={cn(
                        SECTION_ROW_BORDER,
                        index % 2 === 1 && 'bg-muted/15',
                      )}
                    >
                      <TableCell className="px-4 py-3">
                        <p className="font-medium">{iv.name}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            done ? 'text-emerald-700' : 'text-foreground',
                          )}
                        >
                          {iv.total === 0
                            ? 'No assignments'
                            : `${iv.completed}/${iv.total} scored · ${iv.pending} left`}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <SectionHeader>By Session</SectionHeader>
        {sessions.length === 0 && !sessionStatePreview ? (
          <p className="text-sm text-muted-foreground">No interview slots scheduled.</p>
        ) : sessions.length > 0 ? (
          <>
            <SessionTimelineLegend />
            <SessionTimeline sessions={sessions} />
          </>
        ) : null}
        {sessionStatePreview ? (
          <div className={sessions.length > 0 ? 'mt-4' : undefined}>
            <SessionStatePreviewBanner />
            {sessions.length === 0 ? <SessionTimelineLegend /> : null}
            <SessionTimeline sessions={previewSessions} />
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle>{phaseLabel(stage)} Scoring</CardTitle>
            <CardDescription className="text-pretty">
              {summary.slotCount} of {summary.candidateCount} scheduled ·{' '}
              {summary.completed} of {summary.total} scores submitted
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">{statusBadges}</div>
        </div>
      </CardHeader>
      <CardContent>
        <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium transition-colors hover:text-primary">
            <span>Detailed Breakdown</span>
            <ChevronDownIcon
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                detailOpen && 'rotate-180',
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">{breakdown}</CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
