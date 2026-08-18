'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamBadgeClass } from '@/lib/team-colors';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import type { AdvancementSubmissionStatus } from '@/lib/advancement-submissions-types';
import StageBadge from '@/components/stage-badge';

export interface AdvancementActivityCandidate {
  applicationId: number;
  rowIndex: number;
  rank: number;
  average: number;
  rawAverage?: number;
  candidateName?: string | null;
  displayId?: string | null;
}

export interface AdvancementActivityEntry {
  id: number;
  status: AdvancementSubmissionStatus;
  topN: number;
  submittedBy: { name: string; email: string };
  submittedAt: number;
  reviewedBy: { name: string; email: string } | null;
  reviewedAt: number | null;
  teamName?: string;
  roundLabel?: string;
  fromStage?: AdvancementFromStage;
  candidates?: AdvancementActivityCandidate[];
}

type EventKind = 'submitted' | 'approved' | 'replaced' | 'withdrawn';

interface SubmissionEvent {
  kind: EventKind;
  actorName: string;
  at: number;
  description: string;
  badge: { label: string; color: 'yellow' | 'blue' | 'green' | 'gray' };
  complete: boolean;
  /** Submission id — keeps React keys unique across replaced history. */
  sourceId: number;
}

interface SubmissionGroup {
  /** Stable key for expand state: team + fromStage (not per-submission). */
  id: string;
  teamName: string | null;
  fromStage: AdvancementFromStage | null;
  events: SubmissionEvent[];
  latestAt: number;
}

interface TeamSection {
  teamName: string | null;
  latestAt: number;
  groups: SubmissionGroup[];
}

const EXPAND_SLOT_CLASS =
  'inline-flex min-w-[5.5rem] shrink-0 items-center justify-start text-left';

const AVATAR_COLORS = [
  'bg-violet-500',
  'bg-orange-500',
  'bg-emerald-500',
  'bg-fuchsia-500',
  'bg-blue-500',
  'bg-amber-500',
];


function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

function formatActivityTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (sameDay) return `today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return `yesterday ${time}`;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function countLabel(topN: number): string {
  return `${topN} applicant${topN === 1 ? '' : 's'}`;
}

function isSuperseded(entry: AdvancementActivityEntry): boolean {
  return entry.status === 'withdrawn' && !entry.reviewedBy;
}

function sortEventsNewestFirst(events: SubmissionEvent[]): SubmissionEvent[] {
  return [...events].sort((a, b) => {
    if (b.at !== a.at) return b.at - a.at;
    // On equal timestamps prefer review events over submit/replaced.
    const rank = (k: EventKind) => (k === 'submitted' || k === 'replaced' ? 0 : 1);
    if (rank(b.kind) !== rank(a.kind)) return rank(b.kind) - rank(a.kind);
    return b.sourceId - a.sourceId;
  });
}

function eventsForEntry(entry: AdvancementActivityEntry): SubmissionEvent[] {
  const count = countLabel(entry.topN);
  const events: SubmissionEvent[] = [];

  events.push({
    kind: isSuperseded(entry) ? 'replaced' : 'submitted',
    actorName: entry.submittedBy.name,
    at: entry.submittedAt,
    description: `submitted advancement list for ${count} to Admin review`,
    badge: isSuperseded(entry)
      ? { label: 'Replaced', color: 'gray' as const }
      : entry.status === 'submitted'
        ? { label: 'Pending', color: 'yellow' as const }
        : { label: 'Submitted', color: 'blue' as const },
    complete: entry.status !== 'submitted',
    sourceId: entry.id,
  });

  if (entry.status === 'approved' && entry.reviewedBy && entry.reviewedAt) {
    events.push({
      kind: 'approved',
      actorName: entry.reviewedBy.name,
      at: entry.reviewedAt,
      description: `approved advancement list of ${count}`,
      badge: { label: 'Approved', color: 'green' as const },
      complete: true,
      sourceId: entry.id,
    });
  } else if (entry.status === 'withdrawn' && entry.reviewedBy && entry.reviewedAt) {
    events.push({
      kind: 'withdrawn',
      actorName: entry.reviewedBy.name,
      at: entry.reviewedAt,
      description: `withdrew advancement list of ${count}`,
      badge: { label: 'Withdrawn', color: 'gray' as const },
      complete: true,
      sourceId: entry.id,
    });
  }

  return events;
}

function groupKey(teamName: string | null, fromStage: AdvancementFromStage | null): string {
  return `${teamName ?? ''}\0${fromStage ?? ''}`;
}

/**
 * One collapsible group per team + fromStage chain.
 * All submissions in that chain (Approved / Submitted / Replaced…) share one expand control.
 */
function toSubmissionGroups(entries: AdvancementActivityEntry[]): SubmissionGroup[] {
  const buckets = new Map<
    string,
    { teamName: string | null; fromStage: AdvancementFromStage | null; events: SubmissionEvent[] }
  >();

  for (const entry of entries) {
    const teamName = entry.teamName?.trim() || null;
    const fromStage = entry.fromStage ?? null;
    const key = groupKey(teamName, fromStage);
    const bucket = buckets.get(key);
    const entryEvents = eventsForEntry(entry);
    if (bucket) {
      bucket.events.push(...entryEvents);
    } else {
      buckets.set(key, { teamName, fromStage, events: entryEvents });
    }
  }

  const groups: SubmissionGroup[] = [];
  for (const [id, bucket] of buckets) {
    const events = sortEventsNewestFirst(bucket.events);
    if (events.length === 0) continue;
    groups.push({
      id,
      teamName: bucket.teamName,
      fromStage: bucket.fromStage,
      events,
      latestAt: events[0]!.at,
    });
  }

  return groups;
}

/**
 * Group by team. Teams ordered by most recent activity first.
 * Within a team, one group per fromStage (usually one), newest-first.
 * When no team names are present, returns a single untitled section.
 */
function toTeamSections(groups: SubmissionGroup[]): {
  sections: TeamSection[];
  showTeamHeaders: boolean;
} {
  const showTeamHeaders = groups.some((g) => g.teamName != null);
  if (!showTeamHeaders) {
    const sorted = [...groups].sort(
      (a, b) => b.latestAt - a.latestAt || a.id.localeCompare(b.id),
    );
    return {
      sections: [
        {
          teamName: null,
          latestAt: sorted[0]?.latestAt ?? 0,
          groups: sorted,
        },
      ],
      showTeamHeaders: false,
    };
  }

  const byTeam = new Map<string, SubmissionGroup[]>();
  for (const group of groups) {
    const key = group.teamName ?? 'Other';
    const list = byTeam.get(key);
    if (list) list.push(group);
    else byTeam.set(key, [group]);
  }

  const sections: TeamSection[] = [];
  for (const [teamName, teamGroups] of byTeam) {
    const sorted = [...teamGroups].sort(
      (a, b) => b.latestAt - a.latestAt || a.id.localeCompare(b.id),
    );
    sections.push({
      teamName: teamName === 'Other' && !sorted[0]?.teamName ? null : teamName,
      latestAt: Math.max(...sorted.map((g) => g.latestAt)),
      groups: sorted,
    });
  }

  sections.sort(
    (a, b) => b.latestAt - a.latestAt || (a.teamName ?? '').localeCompare(b.teamName ?? ''),
  );
  return { sections, showTeamHeaders: true };
}

function TimelineEventRow({
  event,
  isLast,
  expandControl,
}: {
  event: SubmissionEvent;
  isLast: boolean;
  expandControl?: ReactNode;
}) {
  return (
    <li className="relative flex gap-x-4">
      <div
        className={cn(
          'absolute top-0 left-0 flex w-6 justify-center',
          isLast ? 'h-7' : '-bottom-5',
        )}
      >
        <span aria-hidden className="w-px bg-border" />
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="relative flex size-6 flex-none items-center justify-center">
              <div
                className={cn(
                  'size-2 rounded-full',
                  event.complete ? 'bg-border' : 'bg-primary/40',
                )}
              />
            </div>
            <span
              aria-hidden
              className={cn(
                avatarColor(event.actorName),
                'inline-flex size-7 flex-none items-center justify-center rounded-full text-xs font-medium text-primary-foreground',
              )}
            >
              {initials(event.actorName)}
            </span>
          </div>
          <p className="min-w-0 pt-0.5 text-sm leading-relaxed">
            <span className="font-medium text-foreground">{event.actorName}</span>
            <span className="text-muted-foreground"> {event.description}</span>
            <span className="text-muted-foreground/60">
              {' '}
              · {formatActivityTime(event.at)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {expandControl}
          <StageBadge label={event.badge.label} color={event.badge.color} size="compact" />
        </div>
      </div>
    </li>
  );
}

function ExpandToggle({
  open,
  eventCount,
  onToggle,
}: {
  open: boolean;
  eventCount: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
    >
      {open ? (
        <>
          <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden />
          Less
        </>
      ) : (
        <>
          <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden />
          {eventCount} events
        </>
      )}
    </button>
  );
}

interface FlatEventRow {
  group: SubmissionGroup;
  event: SubmissionEvent;
  isPrimary: boolean;
  multiEvent: boolean;
  open: boolean;
}

function flattenSectionGroups(
  groups: SubmissionGroup[],
  openIds: Set<string>,
): FlatEventRow[] {
  const rows: FlatEventRow[] = [];
  for (const group of groups) {
    const multiEvent = group.events.length > 1;
    const open = !multiEvent || openIds.has(group.id);
    // Events already newest-first; older history appends below the primary row.
    const eventsToShow = open ? group.events : [group.events[0]!];

    eventsToShow.forEach((event, idx) => {
      rows.push({
        group,
        event,
        isPrimary: idx === 0,
        multiEvent,
        open,
      });
    });
  }
  return rows;
}

function EventTrailing({
  isPrimary,
  multiEvent,
  open,
  eventCount,
  onToggleOpen,
}: {
  isPrimary: boolean;
  multiEvent: boolean;
  open: boolean;
  eventCount: number;
  onToggleOpen: () => void;
}) {
  if (!multiEvent || !isPrimary) return null;

  return (
    <span className={EXPAND_SLOT_CLASS}>
      <ExpandToggle open={open} eventCount={eventCount} onToggle={onToggleOpen} />
    </span>
  );
}

export function AdvancementActivityLog({
  entries,
  title = 'Submission activity',
  description = 'Who submitted advancement lists and when',
  className,
  hideHeader = false,
}: {
  entries: AdvancementActivityEntry[];
  title?: string;
  description?: string;
  className?: string;
  hideHeader?: boolean;
}) {
  const groups = useMemo(() => toSubmissionGroups(entries), [entries]);
  const { sections, showTeamHeaders } = useMemo(() => toTeamSections(groups), [groups]);
  // Multi-event groups start collapsed (latest event only).
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No submissions yet.
      </div>
    );
  }

  return (
    <div className={className}>
      {!hideHeader && (title || description) && (
        <div>
          {title ? <h3 className="font-medium text-foreground">{title}</h3> : null}
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      )}
      <div
        className={cn(
          'space-y-8',
          !hideHeader && (title || description) && 'mt-4',
        )}
      >
        {sections.map((section) => {
          const rows = flattenSectionGroups(section.groups, openIds);
          const sectionKey = section.teamName ?? 'all';

          return (
            <section key={sectionKey}>
              {showTeamHeaders && section.teamName ? (
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      teamBadgeClass(section.teamName),
                    )}
                  >
                    {section.teamName}
                  </span>
                </h4>
              ) : null}
              <ul className="space-y-5 pb-1 [overflow-anchor:none]">
                {rows.map((row, stepIdx) => {
                  const isLast = stepIdx === rows.length - 1;
                  const { group, event, isPrimary, multiEvent, open } = row;
                  return (
                    <TimelineEventRow
                      key={`${group.id}:${event.sourceId}:${event.kind}:${event.at}`}
                      event={event}
                      isLast={isLast}
                      expandControl={
                        <EventTrailing
                          isPrimary={isPrimary}
                          multiEvent={multiEvent}
                          open={open}
                          eventCount={group.events.length}
                          onToggleOpen={() => toggleOpen(group.id)}
                        />
                      }
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
