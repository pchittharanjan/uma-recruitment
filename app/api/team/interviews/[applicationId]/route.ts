export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb, type AssignmentStage } from '@/lib/db';
import { forbidden, notFound, unauthorized } from '@/lib/auth';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { interviewGuideForApi, interviewScoreFieldsFromGuide } from '@/lib/interview-guide';
import { getInterviewGuideForRound, getInterviewSlotForApplication, getInterviewGroupMembers } from '@/lib/interview-slots';
import { getRoundSettings } from '@/lib/rounds';
import {
  interviewSessionProgressForApplication,
  nextInterviewSessionApplicationId,
} from '@/lib/interview-sessions';
import { getGraderAssignmentForUser, listGraderAssignments } from '@/lib/team-dashboard';
import { pipelineClosedEditLock } from '@/lib/pipeline-writable';
import { runWithRequestCache } from '@/lib/request-cache';

const INTERVIEW_STAGES: AssignmentStage[] = ['first_round', 'final_round'];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ applicationId: string }> },
) {
  return runWithRequestCache(() => handleGet(req, ctx));
}

async function handleGet(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
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

    const settings = await getRoundSettings(assignment.roundId);
    if (!settings) return notFound('Round not configured');

    const db = getDb();
    const scoresResult = await db.execute({
      sql: 'SELECT field_name, score, note FROM scores WHERE assignment_id = ?',
      args: [assignment.assignmentId],
    });
    const existingScores: Record<string, number> = {};
    const existingNotes: Record<string, string> = {};
    for (const row of scoresResult.rows) {
      const field = row.field_name as string;
      const score = row.score as number | null;
      if (score != null) existingScores[field] = score;
      existingNotes[field] = (row.note as string | null) ?? '';
    }

    const progressResult = await db.execute({
      sql: `SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE a.user_id = ? AND app.team_id = ? AND a.stage = ?`,
      args: [user.id, teamId, stage],
    });

    const slot =
      stage === 'first_round' || stage === 'final_round'
        ? await getInterviewSlotForApplication(applicationId, stage)
        : null;

    const interviewGuide =
      stage === 'first_round' || stage === 'final_round'
        ? interviewGuideForApi(
            await getInterviewGuideForRound(
              assignment.roundId,
              stage as 'first_round' | 'final_round',
            ),
          )
        : null;

    const scoreFields =
      stage === 'first_round' || stage === 'final_round'
        ? interviewScoreFieldsFromGuide(interviewGuide)
        : settings.score_fields;

    const groupMembers =
      stage === 'first_round' || stage === 'final_round'
        ? await getInterviewGroupMembers(applicationId, stage)
        : [];

    let groupEntries:
      | Array<{
          applicationId: number;
          candidateName: string;
          existingScores: Record<string, number>;
          existingNotes: Record<string, string>;
          existingComment: string;
          isComplete: boolean;
        }>
      | undefined;

    if (groupMembers.length > 1) {
      groupEntries = [];
      for (const member of groupMembers) {
        const memberAssignment = await getGraderAssignmentForUser(
          user.id,
          member.applicationId,
          teamId,
          stage,
        );
        if (!memberAssignment) continue;

        const memberScoresResult = await db.execute({
          sql: 'SELECT field_name, score, note FROM scores WHERE assignment_id = ?',
          args: [memberAssignment.assignmentId],
        });
        const memberScores: Record<string, number> = {};
        const memberNotes: Record<string, string> = {};
        for (const row of memberScoresResult.rows) {
          const field = row.field_name as string;
          const score = row.score as number | null;
          if (score != null) memberScores[field] = score;
          memberNotes[field] = (row.note as string | null) ?? '';
        }

        groupEntries.push({
          applicationId: member.applicationId,
          candidateName: member.candidateName,
          existingScores: memberScores,
          existingNotes: memberNotes,
          existingComment: memberAssignment.comment,
          isComplete: memberAssignment.status === 'completed',
        });
      }
    }

    const assignments = await listGraderAssignments(user.id, teamId, stage);
    const interviewProgress = interviewSessionProgressForApplication(
      assignments,
      applicationId,
    );
    const nextApplicationId = nextInterviewSessionApplicationId(assignments, applicationId);

    const scoringEditLock =
      stage === 'first_round'
        ? await getGradingEditLock(teamId, assignment.roundId, 'first_round')
        : ((await pipelineClosedEditLock()) ?? {
            locked: false,
            reason: null,
            message: '',
          });

    return NextResponse.json({
      applicationId: assignment.applicationId,
      assignmentId: assignment.assignmentId,
      rowIndex: assignment.rowIndex,
      candidateName: assignment.candidateName,
      stage,
      existingScores,
      existingNotes,
      existingComment: assignment.comment,
      slot,
      interviewGuide,
      groupMembers,
      groupEntries,
      graderProgress: {
        total: progressResult.rows[0].total as number,
        completed: progressResult.rows[0].completed as number,
      },
      interviewProgress,
      nextApplicationId,
      scoreFields,
      customScoreFields: [],
      scoringEditLock,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
