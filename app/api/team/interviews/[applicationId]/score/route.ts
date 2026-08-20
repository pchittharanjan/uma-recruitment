export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb, type AssignmentStage } from '@/lib/db';
import { forbidden, notFound, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { getRoundSettings } from '@/lib/rounds';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { isTeamDirector } from '@/lib/directors';
import { getGraderAssignmentForUser } from '@/lib/team-dashboard';
import { getInterviewGroupMembers, getInterviewGuideForRound } from '@/lib/interview-slots';
import {
  interviewGuideForApi,
  interviewNoteFieldsFromGuide,
  interviewScaleMax,
  interviewScoreFieldsFromGuide,
} from '@/lib/interview-guide';
import { assertPipelineWritable, pipelineClosedEditLock } from '@/lib/pipeline-writable';

const INTERVIEW_STAGES: AssignmentStage[] = ['first_round', 'final_round'];

interface ScoreEntry {
  applicationId: number;
  scores: Record<string, number>;
  notes?: Record<string, string>;
  comment?: string;
}

function validateScores(
  scores: Record<string, number>,
  scoreFields: string[],
  scaleMax: number,
): string | null {
  for (const field of scoreFields) {
    const val = scores[field];
    if (val === undefined) {
      return `Missing score for field: ${field}`;
    }
    if (!Number.isInteger(val) || val < 1 || val > scaleMax) {
      return `Score for "${field}" must be an integer between 1 and ${scaleMax}`;
    }
  }
  return null;
}

function noteForField(notes: Record<string, string> | undefined, field: string): string | null {
  const value = notes?.[field]?.trim();
  return value ? value : null;
}

function validatePartialScores(
  scores: Record<string, number>,
  scoreFields: string[],
  scaleMax: number,
): string | null {
  const allowed = new Set(scoreFields);
  for (const [field, val] of Object.entries(scores)) {
    if (!allowed.has(field) || val === undefined) continue;
    if (!Number.isInteger(val) || val < 1 || val > scaleMax) {
      return `Score for "${field}" must be an integer between 1 and ${scaleMax}`;
    }
  }
  return null;
}

async function saveInterviewScore(
  assignmentId: number,
  userId: number,
  scoreFields: string[],
  scores: Record<string, number>,
  noteFields: string[],
  notes: Record<string, string> | undefined,
  comment: string,
  options?: { complete?: boolean },
): Promise<void> {
  const complete = options?.complete !== false;
  const db = getDb();
  await db.batch(
    [
      ...scoreFields.map((field) => ({
        sql: `INSERT INTO scores (assignment_id, field_name, score, note) VALUES (?, ?, ?, ?)
              ON CONFLICT(assignment_id, field_name) DO UPDATE SET
                score = excluded.score,
                note = excluded.note`,
        args: [assignmentId, field, scores[field] ?? null, noteForField(notes, field)],
      })),
      ...noteFields.map((field) => ({
        sql: `INSERT INTO scores (assignment_id, field_name, score, note) VALUES (?, ?, ?, ?)
              ON CONFLICT(assignment_id, field_name) DO UPDATE SET
                score = excluded.score,
                note = excluded.note`,
        args: [assignmentId, field, null, noteForField(notes, field)],
      })),
      complete
        ? {
            sql: `UPDATE assignments SET status = 'completed', completed_at = unixepoch(), comment = ?
                  WHERE id = ? AND user_id = ?`,
            args: [comment || null, assignmentId, userId],
          }
        : {
            sql: `UPDATE assignments SET comment = ? WHERE id = ? AND user_id = ?`,
            args: [comment || null, assignmentId, userId],
          },
    ],
    'write',
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    const stageRaw = req.nextUrl.searchParams.get('stage') ?? 'first_round';
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (!INTERVIEW_STAGES.includes(stageRaw as AssignmentStage)) {
      return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
    }
    const stage = stageRaw as AssignmentStage;

    if (!(await canUserAccessTeamStage(user, teamId, stage))) {
      return forbidden('This stage is not open for you yet.');
    }

    const { applicationId: appIdRaw } = await params;
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
    }

    const assignment = await getGraderAssignmentForUser(user.id, applicationId, teamId, stage);
    if (!assignment) return notFound('Assignment not found');

    if (stage === 'first_round') {
      const scoringEditLock = await getGradingEditLock(teamId, assignment.roundId, 'first_round');
      if (scoringEditLock.locked) {
        return forbidden(scoringEditLock.message);
      }
    } else {
      const closedLock = await pipelineClosedEditLock();
      if (closedLock?.locked) {
        return forbidden(closedLock.message);
      }
    }

    const settings = await getRoundSettings(assignment.roundId);
    if (!settings) return notFound('Round not configured');

    const interviewGuide = interviewGuideForApi(
      await getInterviewGuideForRound(assignment.roundId, stage as 'first_round' | 'final_round'),
    );
    const scoreFields = interviewScoreFieldsFromGuide(interviewGuide);
    const noteFields = interviewNoteFieldsFromGuide(interviewGuide);
    const scaleMax = interviewScaleMax(interviewGuide);

    const body = await req.json();

    if (body.draft === true) {
      if (Array.isArray(body.entries)) {
        const entries = body.entries as ScoreEntry[];
        if (entries.length === 0) {
          return NextResponse.json({ error: 'No entries provided.' }, { status: 400 });
        }

        const groupMembers = await getInterviewGroupMembers(
          applicationId,
          stage as 'first_round' | 'final_round',
        );
        if (groupMembers.length <= 1) {
          return NextResponse.json(
            { error: 'Batch draft is only for group interviews.' },
            { status: 400 },
          );
        }

        const groupAppIds = new Set(groupMembers.map((m) => m.applicationId));
        for (const entry of entries) {
          if (!groupAppIds.has(entry.applicationId)) {
            return NextResponse.json({ error: 'Invalid application in batch.' }, { status: 400 });
          }
          const validationError = validatePartialScores(entry.scores ?? {}, scoreFields, scaleMax);
          if (validationError) {
            const member = groupMembers.find((m) => m.applicationId === entry.applicationId);
            const label = member?.candidateName ?? `application ${entry.applicationId}`;
            return NextResponse.json({ error: `${label}: ${validationError}` }, { status: 400 });
          }
        }

        for (const entry of entries) {
          const entryAssignment = await getGraderAssignmentForUser(
            user.id,
            entry.applicationId,
            teamId,
            stage,
          );
          if (!entryAssignment) {
            return notFound(`Assignment not found for application ${entry.applicationId}`);
          }
          await saveInterviewScore(
            entryAssignment.assignmentId,
            user.id,
            scoreFields,
            entry.scores ?? {},
            noteFields,
            entry.notes,
            (entry.comment as string | undefined) ?? '',
            { complete: false },
          );
        }

        return NextResponse.json({ success: true, draft: true });
      }

      const scores = (body.scores as Record<string, number> | undefined) ?? {};
      const notes = (body.notes as Record<string, string> | undefined) ?? {};
      const comment = (body.comment as string | undefined) ?? '';
      const validationError = validatePartialScores(scores, scoreFields, scaleMax);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      await saveInterviewScore(
        assignment.assignmentId,
        user.id,
        scoreFields,
        scores,
        noteFields,
        notes,
        comment,
        { complete: false },
      );

      return NextResponse.json({ success: true, draft: true });
    }

    if (Array.isArray(body.entries)) {
      const entries = body.entries as ScoreEntry[];
      if (entries.length === 0) {
        return NextResponse.json({ error: 'No entries provided.' }, { status: 400 });
      }

      const groupMembers = await getInterviewGroupMembers(
        applicationId,
        stage as 'first_round' | 'final_round',
      );
      if (groupMembers.length <= 1) {
        return NextResponse.json(
          { error: 'Batch submit is only for group interviews.' },
          { status: 400 },
        );
      }

      const groupAppIds = new Set(groupMembers.map((m) => m.applicationId));
      const entryAppIds = new Set(entries.map((e) => e.applicationId));

      if (entryAppIds.size !== groupMembers.length || groupMembers.length !== entries.length) {
        return NextResponse.json(
          { error: 'Must score all applicants in the group.' },
          { status: 400 },
        );
      }

      for (const entry of entries) {
        if (!groupAppIds.has(entry.applicationId)) {
          return NextResponse.json({ error: 'Invalid application in batch.' }, { status: 400 });
        }

        const entryAssignment = await getGraderAssignmentForUser(
          user.id,
          entry.applicationId,
          teamId,
          stage,
        );
        if (!entryAssignment) {
          return notFound(`Assignment not found for application ${entry.applicationId}`);
        }

        const validationError = validateScores(entry.scores ?? {}, scoreFields, scaleMax);
        if (validationError) {
          const member = groupMembers.find((m) => m.applicationId === entry.applicationId);
          const label = member?.candidateName ?? `application ${entry.applicationId}`;
          return NextResponse.json(
            { error: `${label}: ${validationError}` },
            { status: 400 },
          );
        }
      }

      for (const entry of entries) {
        const entryAssignment = await getGraderAssignmentForUser(
          user.id,
          entry.applicationId,
          teamId,
          stage,
        );
        if (!entryAssignment) continue;

        await saveInterviewScore(
          entryAssignment.assignmentId,
          user.id,
          scoreFields,
          entry.scores,
          noteFields,
          entry.notes,
          (entry.comment as string | undefined) ?? '',
        );
      }

      return NextResponse.json({ success: true });
    }

    const scores = body.scores as Record<string, number>;
    const notes = (body.notes as Record<string, string> | undefined) ?? {};
    const comment = (body.comment as string | undefined) ?? '';

    const validationError = validateScores(scores, scoreFields, scaleMax);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await saveInterviewScore(
      assignment.assignmentId,
      user.id,
      scoreFields,
      scores,
      noteFields,
      notes,
      comment,
    );

    const db = getDb();
    const next = await db.execute({
      sql: `SELECT app.id as application_id
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            LEFT JOIN interview_slots islot ON islot.application_id = app.id AND islot.stage = a.stage
            WHERE a.user_id = ? AND app.team_id = ? AND a.stage = ?
              AND a.status = 'pending'
            ORDER BY islot.scheduled_at ASC, app.row_index ASC
            LIMIT 1`,
      args: [user.id, teamId, stage],
    });

    const nextApplicationId =
      next.rows.length > 0 ? (next.rows[0].application_id as number) : null;
    const isDirector =
      nextApplicationId == null &&
      stage === 'first_round' &&
      user.role === 'exec' &&
      (await isTeamDirector(user.id, teamId));

    return NextResponse.json({
      success: true,
      nextApplicationId,
      isDirector: Boolean(isDirector),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
