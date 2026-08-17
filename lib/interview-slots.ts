import { getDb, getRoundById, getTeamById, type AssignmentStage } from '@/lib/db';
import {
  applyTeamInterviewGuideDefaults,
  emptyInterviewGuides,
  parseInterviewGuides,
  serializeInterviewGuides,
  type InterviewGuide,
  type InterviewGuideStage,
  type InterviewGuidesRecord,
} from '@/lib/interview-guide';
import {
  assertNoInterviewerScheduleConflicts,
  assignmentsFromScheduleSlots,
} from '@/lib/interview-schedule-validation';
import { getRoundSettings } from '@/lib/rounds';

export type { InterviewGuide, InterviewGuideStage };

export type InterviewSlotStage = Extract<AssignmentStage, 'first_round' | 'final_round'>;

export interface InterviewSlotInput {
  applicationId: number;
  scheduledAt: string;
  location: string;
  logisticsNote: string;
  groupKey?: string;
  interviewerIds: number[];
}

export interface InterviewSlotView {
  id: number;
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  scheduledAt: string;
  location: string;
  logisticsNote: string;
  groupKey: string;
  interviewerIds: number[];
}

export interface TeamInterviewer {
  id: number;
  name: string;
  email: string;
}

export async function listTeamInterviewers(teamId: number): Promise<TeamInterviewer[]> {
  const db = getDb();
  // Team-scoped execs via access_grants, plus all admins (org-wide; no grant rows).
  const result = await db.execute({
    sql: `SELECT id, name, email FROM (
            SELECT DISTINCT u.id, u.name, u.email
            FROM users u
            JOIN access_grants ag ON ag.user_id = u.id
            WHERE ag.team_id = ? AND ag.revoked_at IS NULL
              AND u.role IN ('exec', 'team_exec', 'ad_hoc_exec')
            UNION
            SELECT u.id, u.name, u.email
            FROM users u
            WHERE u.role = 'admin'
          )
          ORDER BY name ASC`,
    args: [teamId],
  });
  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
  }));
}

export async function listInterviewCandidates(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<Array<{ applicationId: number; rowIndex: number; candidateName: string }>> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT app.id, app.row_index, c.name
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          WHERE app.team_id = ? AND app.round_id = ? AND app.stage = ?
          ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
    args: [teamId, roundId, stage],
  });
  return result.rows.map((row) => ({
    applicationId: row.id as number,
    rowIndex: (row.row_index as number | null) ?? 0,
    candidateName: row.name as string,
  }));
}

/** @deprecated Use listInterviewCandidates(teamId, roundId, 'first_round') */
export async function listFirstRoundCandidates(
  teamId: number,
  roundId: number,
): Promise<Array<{ applicationId: number; rowIndex: number; candidateName: string }>> {
  return listInterviewCandidates(teamId, roundId, 'first_round');
}

export async function getInterviewSlotsForRound(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<InterviewSlotView[]> {
  const db = getDb();
  const slotsResult = await db.execute({
    sql: `SELECT islot.id, islot.application_id, islot.scheduled_at, islot.location, islot.logistics_note,
                 islot.group_key, app.row_index, c.name
          FROM interview_slots islot
          JOIN applications app ON app.id = islot.application_id
          JOIN candidates c ON c.id = app.candidate_id
          WHERE islot.round_id = ? AND islot.team_id = ? AND islot.stage = ?
          ORDER BY islot.scheduled_at ASC, app.row_index ASC`,
    args: [roundId, teamId, stage],
  });

  if (slotsResult.rows.length === 0) return [];

  const slotIds = slotsResult.rows.map((r) => r.id as number);
  const placeholders = slotIds.map(() => '?').join(',');
  const interviewersResult = await db.execute({
    sql: `SELECT slot_id, user_id FROM interview_slot_interviewers WHERE slot_id IN (${placeholders})`,
    args: slotIds,
  });

  const interviewersBySlot = new Map<number, number[]>();
  for (const row of interviewersResult.rows) {
    const slotId = row.slot_id as number;
    if (!interviewersBySlot.has(slotId)) interviewersBySlot.set(slotId, []);
    interviewersBySlot.get(slotId)!.push(row.user_id as number);
  }

  return slotsResult.rows.map((row) => {
    const slotId = row.id as number;
    return {
      id: slotId,
      applicationId: row.application_id as number,
      rowIndex: (row.row_index as number | null) ?? 0,
      candidateName: row.name as string,
      scheduledAt: row.scheduled_at as string,
      location: (row.location as string | null) ?? '',
      logisticsNote: (row.logistics_note as string | null) ?? '',
      groupKey: (row.group_key as string | null) ?? '',
      interviewerIds: interviewersBySlot.get(slotId) ?? [],
    };
  });
}

export async function getInterviewGuidesForRound(
  roundId: number,
): Promise<InterviewGuidesRecord> {
  const settings = await getRoundSettings(roundId);
  if (!settings) return emptyInterviewGuides();
  const guides = parseInterviewGuides(
    settings.interview_guides,
    settings.interview_script_first_round,
  );
  const round = await getRoundById(roundId);
  if (!round) return guides;
  const team = await getTeamById(round.team_id);
  return applyTeamInterviewGuideDefaults(team?.name ?? '', guides);
}

export async function getInterviewGuideForRound(
  roundId: number,
  stage: InterviewGuideStage,
): Promise<InterviewGuide | null> {
  const guides = await getInterviewGuidesForRound(roundId);
  return guides[stage];
}

export async function saveInterviewGuideForRound(
  roundId: number,
  stage: InterviewGuideStage,
  guide: InterviewGuide | null,
): Promise<void> {
  const settings = await getRoundSettings(roundId);
  if (!settings) throw new Error('Round settings not found.');

  const guides = parseInterviewGuides(
    settings.interview_guides,
    settings.interview_script_first_round,
  );
  guides[stage] = guide;

  const db = getDb();
  await db.execute({
    sql: 'UPDATE round_settings SET interview_guides = ? WHERE round_id = ?',
    args: [serializeInterviewGuides(guides), roundId],
  });
}

/** @deprecated Use saveInterviewGuideForRound */
export async function saveInterviewScript(
  roundId: number,
  script: string,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: 'UPDATE round_settings SET interview_script_first_round = ? WHERE round_id = ?',
    args: [script.trim() || null, roundId],
  });
}

export async function saveInterviewSchedule(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
  slots: InterviewSlotInput[],
): Promise<void> {
  const db = getDb();

  const validApps = await db.execute({
    sql: `SELECT id FROM applications
          WHERE team_id = ? AND round_id = ? AND stage = ?`,
    args: [teamId, roundId, stage],
  });
  const validAppIds = new Set(validApps.rows.map((r) => r.id as number));

  for (const slot of slots) {
    if (!validAppIds.has(slot.applicationId)) {
      throw new Error('Invalid application for interview schedule.');
    }
  }

  const interviewers = await listTeamInterviewers(teamId);
  const interviewerNamesById = new Map(interviewers.map((iv) => [iv.id, iv.name]));
  assertNoInterviewerScheduleConflicts(
    assignmentsFromScheduleSlots(slots),
    interviewerNamesById,
  );

  // Cascade deletes interview_slot_interviewers via FK; one statement instead of N round-trips.
  const previousInterviewers = await db.execute({
    sql: `SELECT DISTINCT isi.user_id
          FROM interview_slot_interviewers isi
          JOIN interview_slots islot ON islot.id = isi.slot_id
          WHERE islot.round_id = ? AND islot.team_id = ? AND islot.stage = ?`,
    args: [roundId, teamId, stage],
  });
  const previouslyAssigned = new Set(
    previousInterviewers.rows.map((r) => r.user_id as number),
  );

  await db.execute({
    sql: 'DELETE FROM interview_slots WHERE round_id = ? AND team_id = ? AND stage = ?',
    args: [roundId, teamId, stage],
  });

  for (const slot of slots) {
    if (!slot.scheduledAt.trim()) continue;

    const insert = await db.execute({
      sql: `INSERT INTO interview_slots (round_id, team_id, application_id, stage, scheduled_at, location, logistics_note, group_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        roundId,
        teamId,
        slot.applicationId,
        stage,
        slot.scheduledAt.trim(),
        slot.location.trim() || null,
        slot.logisticsNote.trim() || null,
        slot.groupKey?.trim() || null,
      ],
    });
    const slotId = Number(insert.lastInsertRowid);
    if (slot.interviewerIds.length > 0) {
      const placeholders = slot.interviewerIds.map(() => '(?, ?)').join(', ');
      const args = slot.interviewerIds.flatMap((userId) => [slotId, userId]);
      await db.execute({
        sql: `INSERT INTO interview_slot_interviewers (slot_id, user_id) VALUES ${placeholders}`,
        args,
      });
    }
  }

  await syncInterviewAssignments(teamId, roundId, stage);

  const newlyAssigned = [
    ...new Set(
      slots.flatMap((s) => (s.scheduledAt.trim() ? s.interviewerIds : [])),
    ),
  ].filter((userId) => !previouslyAssigned.has(userId));

  if (newlyAssigned.length > 0) {
    const teamResult = await db.execute({
      sql: 'SELECT name FROM teams WHERE id = ?',
      args: [teamId],
    });
    const teamName = (teamResult.rows[0]?.name as string) ?? 'your team';
    const { notifyInterviewAssigned } = await import('@/lib/notifications');
    await notifyInterviewAssigned({
      teamId,
      teamName,
      stage,
      interviewerUserIds: newlyAssigned,
    });
  }
}

export async function saveFirstRoundSchedule(
  teamId: number,
  roundId: number,
  slots: InterviewSlotInput[],
): Promise<void> {
  return saveInterviewSchedule(teamId, roundId, 'first_round', slots);
}

export async function syncInterviewAssignments(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<void> {
  const db = getDb();

  const pairsResult = await db.execute({
    sql: `SELECT islot.application_id, isi.user_id
          FROM interview_slots islot
          JOIN interview_slot_interviewers isi ON isi.slot_id = islot.id
          WHERE islot.round_id = ? AND islot.team_id = ? AND islot.stage = ?`,
    args: [roundId, teamId, stage],
  });

  const desired = new Set(
    pairsResult.rows.map((r) => `${r.application_id as number}:${r.user_id as number}`),
  );

  const existing = await db.execute({
    sql: `SELECT a.id, a.application_id, a.user_id
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.round_id = ? AND app.team_id = ? AND a.stage = ? AND app.stage = ?`,
    args: [roundId, teamId, stage, stage],
  });

  for (const row of existing.rows) {
    const key = `${row.application_id as number}:${row.user_id as number}`;
    if (!desired.has(key)) {
      await db.execute({ sql: 'DELETE FROM assignments WHERE id = ?', args: [row.id as number] });
    }
  }

  for (const row of pairsResult.rows) {
    await db.execute({
      sql: `INSERT INTO assignments (application_id, user_id, stage)
            VALUES (?, ?, ?)
            ON CONFLICT(application_id, user_id, stage) DO NOTHING`,
      args: [row.application_id as number, row.user_id as number, stage],
    });
  }
}

export async function getInterviewSlotForApplication(
  applicationId: number,
  stage: InterviewSlotStage,
): Promise<{
  scheduledAt: string;
  location: string | null;
  logisticsNote: string | null;
  groupKey: string | null;
} | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT scheduled_at, location, logistics_note, group_key
          FROM interview_slots
          WHERE application_id = ? AND stage = ?`,
    args: [applicationId, stage],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    scheduledAt: row.scheduled_at as string,
    location: (row.location as string | null) ?? null,
    logisticsNote: (row.logistics_note as string | null) ?? null,
    groupKey: (row.group_key as string | null) ?? null,
  };
}

export async function getInterviewGroupMembers(
  applicationId: number,
  stage: InterviewSlotStage,
): Promise<Array<{ applicationId: number; candidateName: string }>> {
  const db = getDb();
  const slotResult = await db.execute({
    sql: `SELECT scheduled_at, group_key
          FROM interview_slots
          WHERE application_id = ? AND stage = ?`,
    args: [applicationId, stage],
  });
  if (slotResult.rows.length === 0) return [];

  const scheduledAt = slotResult.rows[0].scheduled_at as string;
  const groupKey = (slotResult.rows[0].group_key as string | null) ?? null;

  const result = await db.execute({
    sql: groupKey
      ? `SELECT app.id as application_id, c.name as candidate_name
         FROM interview_slots islot
         JOIN applications app ON app.id = islot.application_id
         JOIN candidates c ON c.id = app.candidate_id
         WHERE islot.stage = ? AND islot.scheduled_at = ? AND islot.group_key = ?
         ORDER BY c.name ASC, app.row_index ASC`
      : `SELECT app.id as application_id, c.name as candidate_name
         FROM interview_slots islot
         JOIN applications app ON app.id = islot.application_id
         JOIN candidates c ON c.id = app.candidate_id
         WHERE islot.application_id = ? AND islot.stage = ?
         ORDER BY c.name ASC`,
    args: groupKey ? [stage, scheduledAt, groupKey] : [applicationId, stage],
  });

  return result.rows.map((row) => ({
    applicationId: row.application_id as number,
    candidateName: row.candidate_name as string,
  }));
}


/** @deprecated Use getInterviewGuideForRound */
export async function getInterviewScriptForRound(
  roundId: number,
): Promise<string | null> {
  const guide = await getInterviewGuideForRound(roundId, 'first_round');
  if (!guide) return null;
  if (guide.format === 'questions' && guide.questions?.length === 1) {
    return guide.questions[0];
  }
  const settings = await getRoundSettings(roundId);
  return settings?.interview_script_first_round ?? null;
}

export interface TeamInterviewRoundStats {
  candidateCount: number;
  slotCount: number;
  scoring: { total: number; completed: number };
}

export async function getTeamInterviewRoundStats(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<TeamInterviewRoundStats> {
  const db = getDb();
  // Include slotted applicants even after they leave this stage (e.g. advanced to
  // final_round or rejected). Otherwise schedule/scoring look incomplete once
  // advancement is approved, while submit/approve correctly stay done.
  const [candidates, slots, scoring] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as count FROM (
              SELECT id AS application_id FROM applications
              WHERE team_id = ? AND round_id = ? AND stage = ?
              UNION
              SELECT application_id FROM interview_slots
              WHERE team_id = ? AND round_id = ? AND stage = ?
            )`,
      args: [teamId, roundId, stage, teamId, roundId, stage],
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
            WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ?`,
      args: [teamId, roundId, stage],
    }),
  ]);

  return {
    candidateCount: (candidates.rows[0]?.count as number) ?? 0,
    slotCount: (slots.rows[0]?.count as number) ?? 0,
    scoring: {
      total: (scoring.rows[0]?.total as number) ?? 0,
      completed: (scoring.rows[0]?.completed as number) ?? 0,
    },
  };
}
