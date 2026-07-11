import { getLatestAdvancementSubmission } from '@/lib/advancement-submissions';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { getDb } from '@/lib/db';
import type { InterviewSlotStage } from '@/lib/interview-slots';

export interface GraderVerdictProgress {
  userId: number;
  name: string;
  email: string;
  total: number;
  verdictSet: number;
  pending: number;
  green: number;
  highYellow: number;
  yellow: number;
  lowYellow: number;
  red: number;
}

export interface TeamAdvancementSummary {
  totalAssignments: number;
  scoringCompleted: number;
  verdictSet: number;
  applicationsInStage: number;
  totalApplicants: number;
}

export interface TeamAdvancementStatus {
  teamId: number;
  roundId: number;
  fromStage: AdvancementFromStage;
  graders: GraderVerdictProgress[];
  summary: TeamAdvancementSummary;
  allVerdictsComplete: boolean;
  submission: {
    status: 'none' | 'submitted' | 'approved' | 'withdrawn';
    submittedAt: number | null;
    submittedBy: string | null;
    topN: number | null;
    reviewedAt: number | null;
  };
}

function assignmentStageFor(fromStage: AdvancementFromStage): AdvancementFromStage {
  return fromStage;
}

/** Application-stage readiness counts assignments even if apps were advanced early (test data). */
function matchApplicationStageOnApps(fromStage: AdvancementFromStage): boolean {
  return fromStage !== 'application';
}

export async function getTeamAdvancementStatus(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
): Promise<TeamAdvancementStatus> {
  const db = getDb();
  const stage = assignmentStageFor(fromStage);
  const matchAppStage = matchApplicationStageOnApps(fromStage);
  const assignmentWhere = matchAppStage
    ? 'app.team_id = ? AND app.round_id = ? AND a.stage = ? AND app.stage = ?'
    : 'app.team_id = ? AND app.round_id = ? AND a.stage = ?';
  const assignmentArgs = matchAppStage
    ? [teamId, roundId, stage, stage]
    : [teamId, roundId, stage];

  const [gradersResult, summaryResult, inStageResult, totalAppsResult] = await Promise.all([
    db.execute({
      sql: `SELECT u.id, u.name, u.email,
                   COUNT(a.id) as total,
                   SUM(CASE WHEN a.advancement_verdict IS NOT NULL THEN 1 ELSE 0 END) as verdict_set,
                   SUM(CASE WHEN a.advancement_verdict IS NULL THEN 1 ELSE 0 END) as pending,
                   SUM(CASE WHEN a.advancement_verdict IN ('green', 'yes') THEN 1 ELSE 0 END) as green_count,
                   SUM(CASE WHEN a.advancement_verdict = 'high_yellow' THEN 1 ELSE 0 END) as high_yellow_count,
                   SUM(CASE WHEN a.advancement_verdict IN ('yellow', 'maybe') THEN 1 ELSE 0 END) as yellow_count,
                   SUM(CASE WHEN a.advancement_verdict = 'low_yellow' THEN 1 ELSE 0 END) as low_yellow_count,
                   SUM(CASE WHEN a.advancement_verdict IN ('red', 'no') THEN 1 ELSE 0 END) as red_count
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            JOIN users u ON u.id = a.user_id
            WHERE ${assignmentWhere}
            GROUP BY u.id
            ORDER BY u.name ASC`,
      args: assignmentArgs,
    }),
    db.execute({
      sql: `SELECT COUNT(a.id) as total,
                   SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as scored,
                   SUM(CASE WHEN a.advancement_verdict IS NOT NULL THEN 1 ELSE 0 END) as verdict_set
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE ${assignmentWhere}`,
      args: assignmentArgs,
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM applications
            WHERE team_id = ? AND round_id = ? AND stage = ?`,
      args: [teamId, roundId, stage],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM applications WHERE team_id = ? AND round_id = ?`,
      args: [teamId, roundId],
    }),
  ]);

  const graders: GraderVerdictProgress[] = gradersResult.rows.map((row) => ({
    userId: row.id as number,
    name: row.name as string,
    email: row.email as string,
    total: (row.total as number) ?? 0,
    verdictSet: (row.verdict_set as number) ?? 0,
    pending: (row.pending as number) ?? 0,
    green: (row.green_count as number) ?? 0,
    highYellow: (row.high_yellow_count as number) ?? 0,
    yellow: (row.yellow_count as number) ?? 0,
    lowYellow: (row.low_yellow_count as number) ?? 0,
    red: (row.red_count as number) ?? 0,
  }));

  const summary: TeamAdvancementSummary = {
    totalAssignments: (summaryResult.rows[0]?.total as number) ?? 0,
    scoringCompleted: (summaryResult.rows[0]?.scored as number) ?? 0,
    verdictSet: (summaryResult.rows[0]?.verdict_set as number) ?? 0,
    applicationsInStage: (inStageResult.rows[0]?.count as number) ?? 0,
    totalApplicants: (totalAppsResult.rows[0]?.count as number) ?? 0,
  };

  const allVerdictsComplete =
    summary.totalAssignments > 0 &&
    graders.length > 0 &&
    graders.every((g) => g.total > 0 && g.pending === 0);

  const latest = await getLatestAdvancementSubmission(teamId, roundId, fromStage);
  const submission = latest
    ? {
        status: latest.status,
        submittedAt: latest.submittedAt,
        submittedBy: latest.submittedBy.name,
        topN: latest.topN,
        reviewedAt: latest.reviewedAt,
      }
    : {
        status: 'none' as const,
        submittedAt: null,
        submittedBy: null,
        topN: null,
        reviewedAt: null,
      };

  return {
    teamId,
    roundId,
    fromStage,
    graders,
    summary,
    allVerdictsComplete,
    submission,
  };
}

export interface InterviewerProgress {
  userId: number;
  name: string;
  total: number;
  completed: number;
  pending: number;
}

export interface SlotInterviewer {
  userId: number;
  name: string;
}

export interface SlotProgress {
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

export interface TeamInterviewProgress {
  teamId: number;
  roundId: number;
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

export async function getTeamInterviewProgress(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<TeamInterviewProgress> {
  const db = getDb();

  const [candidates, slots, scoring, interviewers, slotsDetail] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as count FROM applications
            WHERE team_id = ? AND round_id = ? AND stage = ?`,
      args: [teamId, roundId, stage],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM interview_slots
            WHERE team_id = ? AND round_id = ? AND stage = ?`,
      args: [teamId, roundId, stage],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total,
                   SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ? AND app.stage = ?`,
      args: [teamId, roundId, stage, stage],
    }),
    db.execute({
      sql: `SELECT u.id, u.name,
                   COUNT(a.id) as total,
                   SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            JOIN users u ON u.id = a.user_id
            WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ? AND app.stage = ?
            GROUP BY u.id
            ORDER BY u.name ASC`,
      args: [teamId, roundId, stage, stage],
    }),
    db.execute({
      sql: `SELECT islot.id, islot.application_id, islot.scheduled_at, islot.location, islot.group_key,
                   app.row_index, c.name as candidate_name,
                   COUNT(isi.user_id) as interviewer_count,
                   SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as scored_count
            FROM interview_slots islot
            JOIN applications app ON app.id = islot.application_id
            JOIN candidates c ON c.id = app.candidate_id
            LEFT JOIN interview_slot_interviewers isi ON isi.slot_id = islot.id
            LEFT JOIN assignments a ON a.application_id = islot.application_id
              AND a.user_id = isi.user_id AND a.stage = islot.stage
            WHERE islot.team_id = ? AND islot.round_id = ? AND islot.stage = ?
            GROUP BY islot.id
            ORDER BY islot.scheduled_at ASC, app.row_index ASC`,
      args: [teamId, roundId, stage],
    }),
  ]);

  const byInterviewer: InterviewerProgress[] = interviewers.rows.map((row) => {
    const total = (row.total as number) ?? 0;
    const completed = (row.completed as number) ?? 0;
    return {
      userId: row.id as number,
      name: row.name as string,
      total,
      completed,
      pending: total - completed,
    };
  });

  const slotIds = slotsDetail.rows.map((row) => row.id as number);
  const interviewersBySlot = new Map<number, SlotInterviewer[]>();

  if (slotIds.length > 0) {
    const placeholders = slotIds.map(() => '?').join(',');
    const slotInterviewers = await db.execute({
      sql: `SELECT isi.slot_id, isi.user_id, u.name
            FROM interview_slot_interviewers isi
            JOIN users u ON u.id = isi.user_id
            JOIN interview_slots islot ON islot.id = isi.slot_id
            WHERE isi.slot_id IN (${placeholders})
              AND islot.team_id = ?
            ORDER BY u.name ASC`,
      args: [...slotIds, teamId],
    });

    for (const row of slotInterviewers.rows) {
      const slotId = row.slot_id as number;
      const list = interviewersBySlot.get(slotId) ?? [];
      list.push({
        userId: row.user_id as number,
        name: row.name as string,
      });
      interviewersBySlot.set(slotId, list);
    }
  }

  const bySlot: SlotProgress[] = slotsDetail.rows.map((row) => {
    const interviewerCount = (row.interviewer_count as number) ?? 0;
    const scoredCount = (row.scored_count as number) ?? 0;
    const slotId = row.id as number;
    return {
      slotId,
      applicationId: row.application_id as number,
      candidateName: row.candidate_name as string,
      rowIndex: (row.row_index as number | null) ?? 0,
      scheduledAt: row.scheduled_at as string,
      location: (row.location as string | null) ?? '',
      groupKey: (row.group_key as string | null) ?? null,
      interviewerCount,
      scoredCount,
      complete: interviewerCount > 0 && scoredCount === interviewerCount,
      interviewers: interviewersBySlot.get(slotId) ?? [],
    };
  });

  return {
    teamId,
    roundId,
    stage,
    summary: {
      candidateCount: (candidates.rows[0]?.count as number) ?? 0,
      slotCount: (slots.rows[0]?.count as number) ?? 0,
      total: (scoring.rows[0]?.total as number) ?? 0,
      completed: (scoring.rows[0]?.completed as number) ?? 0,
    },
    byInterviewer,
    bySlot,
  };
}
