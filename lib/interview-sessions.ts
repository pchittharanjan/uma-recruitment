export interface InterviewSessionAssignment {
  applicationId: number;
  groupKey: string | null;
  scheduledAt: string | null;
  location: string | null;
}

export function sessionKeyForAssignment(a: InterviewSessionAssignment): string {
  const scheduledAt = a.scheduledAt?.trim();
  const groupKey = a.groupKey?.trim();
  if (scheduledAt && groupKey) return `${scheduledAt}|${groupKey}`;
  if (scheduledAt) return `${scheduledAt}|solo-${a.applicationId}`;
  return `solo-${a.applicationId}`;
}

export function groupAssignmentsIntoSessions<T extends InterviewSessionAssignment>(
  assignments: T[],
): T[][] {
  const map = new Map<string, T[]>();

  for (const assignment of assignments) {
    const key = sessionKeyForAssignment(assignment);
    const existing = map.get(key);
    if (existing) {
      existing.push(assignment);
      continue;
    }
    map.set(key, [assignment]);
  }

  const seen = new Set<string>();
  const sessions: T[][] = [];
  for (const assignment of assignments) {
    const key = sessionKeyForAssignment(assignment);
    if (seen.has(key)) continue;
    seen.add(key);
    sessions.push(map.get(key)!);
  }

  return sessions;
}

export function interviewSessionProgressForApplication(
  assignments: InterviewSessionAssignment[],
  applicationId: number,
): { current: number; total: number } | null {
  const sessions = groupAssignmentsIntoSessions(assignments);
  const total = sessions.length;
  if (total === 0) return null;

  for (let index = 0; index < sessions.length; index += 1) {
    if (sessions[index].some((assignment) => assignment.applicationId === applicationId)) {
      return { current: index + 1, total };
    }
  }

  return null;
}

export function nextInterviewSessionApplicationId(
  assignments: InterviewSessionAssignment[],
  applicationId: number,
): number | null {
  const sessions = groupAssignmentsIntoSessions(assignments);
  for (let index = 0; index < sessions.length; index += 1) {
    if (sessions[index].some((assignment) => assignment.applicationId === applicationId)) {
      const nextSession = sessions[index + 1];
      if (!nextSession) return null;
      return nextSession[0].applicationId;
    }
  }
  return null;
}

export function formatInterviewProgressLabel(progress: {
  current: number;
  total: number;
}): string {
  return `Interview ${progress.current} of ${progress.total}`;
}
