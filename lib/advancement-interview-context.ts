import { getDb, getTeamById } from '@/lib/db';
import { listTeamAdvancementVerdicts, normalizeAdvancementVerdict } from '@/lib/advancement-verdicts';
import {
  applicationQuestionLabels,
  loadAdvancementStageReviews,
  type AdvancementStageReview,
} from '@/lib/advancement-stage-reviews';
import type {
  AdvancementApplicationContext,
  AdvancementGroupMember,
  AdvancementInterviewContext,
  AdvancementPanelNote,
  AdvancementPanelVerdict,
  AdvancementReviewerNotes,
} from '@/lib/advancement-submissions-types';
import { getRoundSettings } from '@/lib/rounds';
import { sessionKeyForAssignment } from '@/lib/interview-sessions';

function toReviewerNotes(
  reviews: AdvancementStageReview[],
  viewerUserId: number,
): AdvancementReviewerNotes[] {
  return reviews.map((review) => ({
    reviewerName: review.reviewerName,
    comment: review.comment,
    questionNotes: review.questionNotes,
    average: review.average,
    isMine: review.userId === viewerUserId,
  }));
}

/** Arithmetic mean of numeric score rows for one assignment; null if none. */
function meanOfScores(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 1000) / 1000;
}

async function myAveragesByApplication(
  userId: number,
  stage: 'application' | 'first_round',
  applicationIds: number[],
): Promise<Map<number, number>> {
  const averages = new Map<number, number>();
  if (applicationIds.length === 0) return averages;

  const db = getDb();
  const placeholders = applicationIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT a.application_id, s.score
          FROM assignments a
          JOIN scores s ON s.assignment_id = a.id
          WHERE a.user_id = ? AND a.stage = ? AND a.status = 'completed'
            AND a.application_id IN (${placeholders})
            AND s.score IS NOT NULL`,
    args: [userId, stage, ...applicationIds],
  });

  const scoresByApp = new Map<number, number[]>();
  for (const row of result.rows) {
    const applicationId = row.application_id as number;
    if (!scoresByApp.has(applicationId)) scoresByApp.set(applicationId, []);
    scoresByApp.get(applicationId)!.push(row.score as number);
  }

  for (const [applicationId, scores] of scoresByApp) {
    const mean = meanOfScores(scores);
    if (mean !== null) averages.set(applicationId, mean);
  }

  return averages;
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

function buildGroupLabel(
  groupMembers: AdvancementGroupMember[],
  scheduledAt: string | null,
  coInterviewerNames: string[],
): string | null {
  const timeLabel = formatSlotTime(scheduledAt);
  const isGroup = groupMembers.length > 1;
  const parts: string[] = [];

  if (isGroup) {
    parts.push('Group interview');
  } else {
    parts.push('Interview');
  }

  if (timeLabel) parts.push(timeLabel);

  if (coInterviewerNames.length > 0) {
    const names =
      coInterviewerNames.length <= 3
        ? coInterviewerNames.join(', ')
        : `${coInterviewerNames.slice(0, 2).join(', ')} +${coInterviewerNames.length - 2} more`;
    parts.push(`with ${names}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export async function buildFirstRoundAdvancementContext(
  teamId: number,
  roundId: number,
  userId: number,
  applicationIds: number[],
): Promise<Map<number, AdvancementInterviewContext>> {
  const contextByApp = new Map<number, AdvancementInterviewContext>();
  if (applicationIds.length === 0) return contextByApp;

  const db = getDb();
  const placeholders = applicationIds.map(() => '?').join(',');

  const assignmentsResult = await db.execute({
    sql: `SELECT a.application_id, a.user_id, a.status, a.comment, a.advancement_verdict,
                 u.name as interviewer_name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN users u ON u.id = a.user_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'first_round'
            AND app.stage = 'first_round'
            AND a.application_id IN (${placeholders})
          ORDER BY a.application_id ASC, u.name ASC`,
    args: [teamId, roundId, ...applicationIds],
  });

  const slotsResult = await db.execute({
    sql: `SELECT islot.id, islot.application_id, islot.scheduled_at, islot.location, islot.group_key
          FROM interview_slots islot
          JOIN applications app ON app.id = islot.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND islot.stage = 'first_round'
            AND islot.application_id IN (${placeholders})`,
    args: [teamId, roundId, ...applicationIds],
  });

  const slotByApp = new Map<
    number,
    { id: number; scheduledAt: string; location: string | null; groupKey: string | null }
  >();
  for (const row of slotsResult.rows) {
    slotByApp.set(row.application_id as number, {
      id: row.id as number,
      scheduledAt: row.scheduled_at as string,
      location: (row.location as string | null) ?? null,
      groupKey: (row.group_key as string | null) ?? null,
    });
  }

  const slotIds = [...new Set([...slotByApp.values()].map((s) => s.id))];
  const interviewersBySlot = new Map<number, Map<number, string>>();
  if (slotIds.length > 0) {
    const slotPlaceholders = slotIds.map(() => '?').join(',');
    const interviewersResult = await db.execute({
      sql: `SELECT isi.slot_id, isi.user_id, u.name
            FROM interview_slot_interviewers isi
            JOIN users u ON u.id = isi.user_id
            WHERE isi.slot_id IN (${slotPlaceholders})`,
      args: slotIds,
    });
    for (const row of interviewersResult.rows) {
      const slotId = row.slot_id as number;
      if (!interviewersBySlot.has(slotId)) interviewersBySlot.set(slotId, new Map());
      interviewersBySlot.get(slotId)!.set(row.user_id as number, row.name as string);
    }
  }

  const groupMembersByApp = new Map<number, AdvancementGroupMember[]>();
  const groupKeys = new Set<string>();
  for (const [appId, slot] of slotByApp) {
    const key = slot.groupKey?.trim()
      ? `${slot.scheduledAt}|${slot.groupKey.trim()}`
      : `solo-${appId}`;
    groupKeys.add(key);
  }

  for (const key of groupKeys) {
    if (key.startsWith('solo-')) {
      const appId = Number.parseInt(key.slice(5), 10);
      const slot = slotByApp.get(appId);
      if (!slot) continue;
      const memberResult = await db.execute({
        sql: `SELECT app.id as application_id, c.name as candidate_name
              FROM interview_slots islot
              JOIN applications app ON app.id = islot.application_id
              JOIN candidates c ON c.id = app.candidate_id
              WHERE islot.id = ?`,
        args: [slot.id],
      });
      const members = memberResult.rows.map((row) => ({
        applicationId: row.application_id as number,
        candidateName: row.candidate_name as string,
      }));
      for (const member of members) {
        groupMembersByApp.set(member.applicationId, members);
      }
      continue;
    }

    const [scheduledAt, groupKey] = key.split('|');
    const memberResult = await db.execute({
      sql: `SELECT app.id as application_id, c.name as candidate_name
            FROM interview_slots islot
            JOIN applications app ON app.id = islot.application_id
            JOIN candidates c ON c.id = app.candidate_id
            WHERE islot.stage = 'first_round' AND islot.scheduled_at = ? AND islot.group_key = ?
            ORDER BY c.name ASC, app.row_index ASC`,
      args: [scheduledAt, groupKey],
    });
    const members = memberResult.rows.map((row) => ({
      applicationId: row.application_id as number,
      candidateName: row.candidate_name as string,
    }));
    for (const member of members) {
      groupMembersByApp.set(member.applicationId, members);
    }
  }

  const verdictsByApp = await listTeamAdvancementVerdicts(
    teamId,
    roundId,
    'first_round',
    applicationIds,
  );

  const myAverages = await myAveragesByApplication(userId, 'first_round', applicationIds);

  const team = await getTeamById(teamId);
  const settings = await getRoundSettings(roundId);
  const questionLabels =
    team && settings ? applicationQuestionLabels(settings, team.name) : undefined;

  const [interviewReviewsByApp, applicationReviewsByApp] = await Promise.all([
    loadAdvancementStageReviews({
      teamId,
      roundId,
      stage: 'first_round',
      applicationIds,
    }),
    loadAdvancementStageReviews({
      teamId,
      roundId,
      stage: 'application',
      applicationIds,
      questionLabels,
    }),
  ]);

  const assignmentsByApp = new Map<
    number,
    Array<{
      userId: number;
      interviewerName: string;
      status: string;
      comment: string | null;
      advancementVerdict: string | null;
    }>
  >();

  for (const row of assignmentsResult.rows) {
    const applicationId = row.application_id as number;
    if (!assignmentsByApp.has(applicationId)) assignmentsByApp.set(applicationId, []);
    assignmentsByApp.get(applicationId)!.push({
      userId: row.user_id as number,
      interviewerName: row.interviewer_name as string,
      status: row.status as string,
      comment: (row.comment as string | null) ?? null,
      advancementVerdict: (row.advancement_verdict as string | null) ?? null,
    });
  }

  function parseVerdict(raw: string | null) {
    return normalizeAdvancementVerdict(raw);
  }

  function panelVerdictsFor(
    applicationId: number,
    viewerId: number,
  ): AdvancementPanelVerdict[] {
    return (verdictsByApp.get(applicationId) ?? [])
      .filter((v) => v.userId !== viewerId)
      .map((v) => ({ name: v.name, verdict: v.verdict }));
  }

  for (const applicationId of applicationIds) {
    const assignments = assignmentsByApp.get(applicationId) ?? [];
    const mine = assignments.find((a) => a.userId === userId);
    const iInterviewed = Boolean(mine?.status === 'completed');
    const interviewReviews = interviewReviewsByApp.get(applicationId) ?? [];
    const interviewNotes = toReviewerNotes(interviewReviews, userId);

    const panelNotes: AdvancementPanelNote[] = interviewReviews
      .filter((a) => a.userId !== userId)
      .map((a) => ({
        interviewerName: a.reviewerName,
        comment: a.comment,
        questionNotes: a.questionNotes,
      }));

    const slot = slotByApp.get(applicationId);
    const groupMembers = groupMembersByApp.get(applicationId) ?? [];
    const coInterviewerNames = slot
      ? [...(interviewersBySlot.get(slot.id)?.entries() ?? [])]
          .filter(([id]) => id !== userId)
          .map(([, name]) => name)
          .sort((a, b) => a.localeCompare(b))
      : [];
    const scheduledAt = slot?.scheduledAt ?? null;
    const location = slot?.location ?? null;
    const groupKey = slot?.groupKey ?? null;
    const sessionKey = slot
      ? sessionKeyForAssignment({
          applicationId,
          groupKey,
          scheduledAt,
          location,
        })
      : 'unscheduled';

    const myReview = interviewReviews.find((r) => r.userId === userId);

    contextByApp.set(applicationId, {
      iInterviewed,
      myAverage: iInterviewed ? (myAverages.get(applicationId) ?? null) : null,
      myVerdict: parseVerdict(mine?.advancementVerdict ?? null),
      panelVerdicts: panelVerdictsFor(applicationId, userId),
      myNotes: myReview?.comment ?? mine?.comment ?? null,
      panelNotes,
      interviewNotes,
      applicationNotes: toReviewerNotes(
        applicationReviewsByApp.get(applicationId) ?? [],
        userId,
      ),
      groupLabel: buildGroupLabel(
        groupMembers,
        scheduledAt,
        coInterviewerNames,
      ),
      groupMembers,
      scheduledAt,
      location,
      groupKey,
      sessionKey,
    });
  }

  return contextByApp;
}

export async function buildApplicationAdvancementContext(
  teamId: number,
  roundId: number,
  userId: number,
  applicationIds: number[],
): Promise<Map<number, AdvancementApplicationContext>> {
  const contextByApp = new Map<number, AdvancementApplicationContext>();
  if (applicationIds.length === 0) return contextByApp;

  const db = getDb();
  const placeholders = applicationIds.map(() => '?').join(',');

  const assignmentsResult = await db.execute({
    sql: `SELECT a.application_id, a.user_id, a.status, a.advancement_verdict, u.name
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          JOIN users u ON u.id = a.user_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'
            AND app.stage = 'application'
            AND a.application_id IN (${placeholders})
          ORDER BY a.application_id ASC, u.name ASC`,
    args: [teamId, roundId, ...applicationIds],
  });

  const verdictsByApp = await listTeamAdvancementVerdicts(
    teamId,
    roundId,
    'application',
    applicationIds,
  );

  const myAverages = await myAveragesByApplication(userId, 'application', applicationIds);

  const team = await getTeamById(teamId);
  const settings = await getRoundSettings(roundId);
  const questionLabels =
    team && settings ? applicationQuestionLabels(settings, team.name) : undefined;
  const graderReviewsByApp = await loadAdvancementStageReviews({
    teamId,
    roundId,
    stage: 'application',
    applicationIds,
    questionLabels,
  });

  const assignmentsByApp = new Map<
    number,
    Array<{ userId: number; name: string; status: string; advancementVerdict: string | null }>
  >();

  for (const row of assignmentsResult.rows) {
    const applicationId = row.application_id as number;
    if (!assignmentsByApp.has(applicationId)) assignmentsByApp.set(applicationId, []);
    assignmentsByApp.get(applicationId)!.push({
      userId: row.user_id as number,
      name: row.name as string,
      status: row.status as string,
      advancementVerdict: (row.advancement_verdict as string | null) ?? null,
    });
  }

  function parseVerdict(raw: string | null) {
    return normalizeAdvancementVerdict(raw);
  }

  for (const applicationId of applicationIds) {
    const assignments = assignmentsByApp.get(applicationId) ?? [];
    const mine = assignments.find((a) => a.userId === userId);
    const iGraded = Boolean(mine?.status === 'completed');

    contextByApp.set(applicationId, {
      iGraded,
      myAverage: iGraded ? (myAverages.get(applicationId) ?? null) : null,
      myVerdict: parseVerdict(mine?.advancementVerdict ?? null),
      panelVerdicts: (verdictsByApp.get(applicationId) ?? [])
        .filter((v) => v.userId !== userId)
        .map((v) => ({ name: v.name, verdict: v.verdict })),
      graderNotes: toReviewerNotes(graderReviewsByApp.get(applicationId) ?? [], userId),
    });
  }

  return contextByApp;
}
