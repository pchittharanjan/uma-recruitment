export interface InterviewerScheduleConflict {
  interviewerId: number;
  interviewerName: string;
  scheduledAt: string;
  timeLabel: string;
  sessionKeys: string[];
}

export interface InterviewerScheduleValidationResult {
  conflicts: InterviewerScheduleConflict[];
  conflictSessionKeys: string[];
  messages: string[];
  error: string | null;
}

export class InterviewScheduleValidationError extends Error {
  readonly validation: InterviewerScheduleValidationResult;

  constructor(validation: InterviewerScheduleValidationResult) {
    super(validation.error ?? 'Interview schedule has conflicts.');
    this.name = 'InterviewScheduleValidationError';
    this.validation = validation;
  }
}

export function formatScheduleConflictTime(scheduledAt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(scheduledAt.trim());
  if (!match) return scheduledAt;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const hour12 = hour % 12 || 12;
  const period = hour >= 12 ? 'PM' : 'AM';
  const time =
    minute === 0 ? `${hour12} ${period}` : `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  return `${weekday} ${time}`;
}

function interviewerName(id: number, namesById: Map<number, string>): string {
  return namesById.get(id) ?? `Interviewer #${id}`;
}

function conflictMessage(name: string, count: number, timeLabel: string): string {
  return `${name} is assigned to ${count} interviews at ${timeLabel}`;
}

export function validateInterviewerAssignments(
  assignments: Array<{
    sessionKey: string;
    scheduledAt: string;
    interviewerIds: number[];
  }>,
  interviewerNamesById: Map<number, string>,
  timeLabelsByScheduledAt?: Map<string, string>,
): InterviewerScheduleValidationResult {
  const active = assignments.filter(
    (assignment) => assignment.scheduledAt.trim() && assignment.interviewerIds.length > 0,
  );

  const conflicts: InterviewerScheduleConflict[] = [];
  const conflictSessionKeys = new Set<string>();

  const byTime = new Map<string, typeof active>();
  for (const assignment of active) {
    const scheduledAt = assignment.scheduledAt.trim();
    if (!byTime.has(scheduledAt)) byTime.set(scheduledAt, []);
    byTime.get(scheduledAt)!.push(assignment);
  }

  for (const [scheduledAt, sessionsAtTime] of byTime) {
    const timeLabel =
      timeLabelsByScheduledAt?.get(scheduledAt) ?? formatScheduleConflictTime(scheduledAt);

    const interviewerToSessions = new Map<number, string[]>();
    for (const session of sessionsAtTime) {
      const uniqueIds = [...new Set(session.interviewerIds)];
      for (const id of uniqueIds) {
        if (!interviewerToSessions.has(id)) interviewerToSessions.set(id, []);
        interviewerToSessions.get(id)!.push(session.sessionKey);
      }
    }

    for (const [interviewerId, sessionKeys] of interviewerToSessions) {
      const uniqueSessions = [...new Set(sessionKeys)];
      if (uniqueSessions.length > 1) {
        const name = interviewerName(interviewerId, interviewerNamesById);
        conflicts.push({
          interviewerId,
          interviewerName: name,
          scheduledAt,
          timeLabel,
          sessionKeys: uniqueSessions,
        });
        for (const sessionKey of uniqueSessions) conflictSessionKeys.add(sessionKey);
      }
    }
  }

  const messages = conflicts.map((conflict) =>
    conflictMessage(conflict.interviewerName, conflict.sessionKeys.length, conflict.timeLabel),
  );

  return {
    conflicts,
    conflictSessionKeys: [...conflictSessionKeys],
    messages,
    error: messages[0] ?? null,
  };
}

export function assignmentsFromScheduleSlots(
  slots: Array<{
    applicationId: number;
    scheduledAt: string;
    groupKey?: string;
    interviewerIds: number[];
  }>,
): Array<{ sessionKey: string; scheduledAt: string; interviewerIds: number[] }> {
  const bySession = new Map<
    string,
    { scheduledAt: string; interviewerIds: Set<number> }
  >();

  for (const slot of slots) {
    const scheduledAt = slot.scheduledAt.trim();
    if (!scheduledAt) continue;

    const groupKey = slot.groupKey?.trim();
    const sessionKey = groupKey
      ? `${scheduledAt}|${groupKey}`
      : `${scheduledAt}|solo-${slot.applicationId}`;

    if (!bySession.has(sessionKey)) {
      bySession.set(sessionKey, { scheduledAt, interviewerIds: new Set() });
    }

    const entry = bySession.get(sessionKey)!;
    for (const id of slot.interviewerIds) entry.interviewerIds.add(id);
  }

  return [...bySession.entries()].map(([sessionKey, value]) => ({
    sessionKey,
    scheduledAt: value.scheduledAt,
    interviewerIds: [...value.interviewerIds],
  }));
}

export function assignmentsFromUiSessions(
  sessions: Array<{
    id: string;
    scheduledAt: string;
    interviewerIds: (number | null)[];
  }>,
): Array<{ sessionKey: string; scheduledAt: string; interviewerIds: number[] }> {
  return sessions
    .map((session) => ({
      sessionKey: session.id,
      scheduledAt: session.scheduledAt,
      interviewerIds: session.interviewerIds.filter((id): id is number => id != null),
    }))
    .filter((session) => session.scheduledAt.trim() && session.interviewerIds.length > 0);
}

export function assertNoInterviewerScheduleConflicts(
  assignments: Array<{
    sessionKey: string;
    scheduledAt: string;
    interviewerIds: number[];
  }>,
  interviewerNamesById: Map<number, string>,
): void {
  const validation = validateInterviewerAssignments(assignments, interviewerNamesById);
  if (validation.error) {
    throw new InterviewScheduleValidationError(validation);
  }
}
