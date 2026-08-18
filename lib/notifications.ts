import { getDb, type TeamName } from '@/lib/db';

export type NotificationKind =
  | 'applications_assigned'
  | 'application_unlocked'
  | 'interview_assigned';

export type InterviewNotificationStage = 'first_round' | 'final_round';

export interface NotificationRow {
  id: number;
  user_id: number;
  kind: NotificationKind | string;
  title: string;
  body: string | null;
  href: string | null;
  team_id: number | null;
  read_at: number | null;
  created_at: number;
}

export interface CreateNotificationInput {
  userId: number;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  teamId?: number | null;
}

function rowToNotification(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    kind: row.kind as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    href: (row.href as string | null) ?? null,
    team_id: (row.team_id as number | null) ?? null,
    read_at: (row.read_at as number | null) ?? null,
    created_at: row.created_at as number,
  };
}

export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const db = getDb();
  const placeholders = inputs.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const args = inputs.flatMap((n) => [
    n.userId,
    n.kind,
    n.title,
    n.body ?? null,
    n.href ?? null,
    n.teamId ?? null,
  ]);
  await db.execute({
    sql: `INSERT INTO notifications (user_id, kind, title, body, href, team_id)
          VALUES ${placeholders}`,
    args,
  });
}

export async function listNotificationsForUser(
  userId: number,
  options?: { limit?: number },
): Promise<NotificationRow[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  const result = await db.execute({
    sql: `SELECT id, user_id, kind, title, body, href, team_id, read_at, created_at
          FROM notifications
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows.map((row) => rowToNotification(row as Record<string, unknown>));
}

export async function countUnreadNotifications(userId: number): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL',
    args: [userId],
  });
  return (result.rows[0]?.count as number) ?? 0;
}

export async function markNotificationRead(userId: number, id: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE notifications
          SET read_at = unixepoch()
          WHERE id = ? AND user_id = ? AND read_at IS NULL`,
    args: [id, userId],
  });
  return result.rowsAffected > 0;
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE notifications
          SET read_at = unixepoch()
          WHERE user_id = ? AND read_at IS NULL`,
    args: [userId],
  });
  return result.rowsAffected;
}

/** After import: one notification per grader with how many apps they got. */
export async function notifyApplicationsAssigned(params: {
  teamId: number;
  teamName: TeamName | string;
  assignments: Array<{ userId: number }>;
}): Promise<void> {
  const counts = new Map<number, number>();
  for (const a of params.assignments) {
    counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
  }
  if (counts.size === 0) return;

  const href = `/team/${params.teamId}/grade`;
  const inputs: CreateNotificationInput[] = [];
  for (const [userId, count] of counts) {
    const appLabel = count === 1 ? '1 application' : `${count} applications`;
    inputs.push({
      userId,
      kind: 'applications_assigned',
      title: `${appLabel} assigned — ${params.teamName}`,
      body: `Your queue is ready. Grading will open once the Application stage is unlocked.`,
      href,
      teamId: params.teamId,
    });
  }
  await createNotifications(inputs);
}

/** When Application stage is unlocked on these rounds, ping graders with assignments. */
export async function notifyApplicationUnlocked(roundIds: number[]): Promise<void> {
  if (roundIds.length === 0) return;
  const db = getDb();
  const placeholders = roundIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT DISTINCT a.user_id, app.team_id, t.name AS team_name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN teams t ON t.id = app.team_id
          WHERE app.round_id IN (${placeholders})
            AND a.stage = 'application'`,
    args: roundIds,
  });

  // One notification per user per team (a user may grade multiple teams).
  const seen = new Set<string>();
  const inputs: CreateNotificationInput[] = [];
  for (const row of result.rows) {
    const userId = row.user_id as number;
    const teamId = row.team_id as number;
    const key = `${userId}:${teamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push({
      userId,
      kind: 'application_unlocked',
      title: `Application grading open — ${row.team_name as string}`,
      body: `Your assigned applications are ready to grade.`,
      href: `/team/${teamId}/grade`,
      teamId,
    });
  }
  await createNotifications(inputs);
}

/** After interview schedule save: one notification per interviewer. */
export async function notifyInterviewAssigned(params: {
  teamId: number;
  teamName: TeamName | string;
  stage: InterviewNotificationStage;
  interviewerUserIds: number[];
}): Promise<void> {
  const unique = [...new Set(params.interviewerUserIds)];
  if (unique.length === 0) return;

  const stageLabel = params.stage === 'first_round' ? 'First Round' : 'Final Round';
  const href = `/team/${params.teamId}/interviews/${params.stage}`;
  await createNotifications(
    unique.map((userId) => ({
      userId,
      kind: 'interview_assigned' as const,
      title: `${stageLabel} interviews assigned — ${params.teamName}`,
      body: `You have candidates to interview. Open your interview list to see who's scheduled.`,
      href,
      teamId: params.teamId,
    })),
  );
}
