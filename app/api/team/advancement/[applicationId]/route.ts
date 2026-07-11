export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { applicantDisplayId } from '@/lib/blind';
import { extractCandidateFromFields } from '@/lib/candidates';
import { forbidden, unauthorized } from '@/lib/auth';
import { userHasTeamAccess } from '@/lib/access';
import { isTeamDirector } from '@/lib/directors';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam, getRoundSettings } from '@/lib/rounds';
import {
  getGraderAssignmentForUser,
  serializeApplicationFields,
  userSeesBlindApplications,
} from '@/lib/team-dashboard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec'] });
    if (!user) return unauthorized();

    const { applicationId: appIdRaw } = await params;
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
    }

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (!(await userHasTeamAccess(user, teamId))) return forbidden();

    const fromStage = req.nextUrl.searchParams.get('fromStage');
    if (fromStage !== 'application') {
      return NextResponse.json(
        { error: 'Application detail is only available during application advancement.' },
        { status: 400 },
      );
    }

    const isDirector = await isTeamDirector(user.id, teamId);
    const assignment = await getGraderAssignmentForUser(user.id, applicationId, teamId);

    if (!isDirector && !assignment) {
      return NextResponse.json(
        { error: 'You can only view applications you graded.' },
        { status: 403 },
      );
    }

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const settings = await getRoundSettings(round.id);
    if (!settings) {
      return NextResponse.json({ error: 'Round not configured.' }, { status: 404 });
    }

    const db = getDb();
    const appResult = await db.execute({
      sql: `SELECT id, row_index, fields, stage FROM applications
            WHERE id = ? AND team_id = ? AND round_id = ?`,
      args: [applicationId, teamId, round.id],
    });
    if (appResult.rows.length === 0) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const row = appResult.rows[0];
    const fields = JSON.parse(row.fields as string) as Record<string, string>;
    const rowIndex = (row.row_index as number | null) ?? 0;
    const { name: candidateName } = extractCandidateFromFields(fields);
    // Keep application-stage advancement blind for Directors too (API-layer strip).
    const blind = userSeesBlindApplications(user);

    let existingScores: Record<string, number> = {};
    let existingComment: string | null = null;

    if (assignment) {
      const scoresResult = await db.execute({
        sql: 'SELECT field_name, score FROM scores WHERE assignment_id = ?',
        args: [assignment.assignmentId],
      });
      for (const scoreRow of scoresResult.rows) {
        existingScores[scoreRow.field_name as string] = scoreRow.score as number;
      }
      existingComment = assignment.comment || null;
    }

    return NextResponse.json({
      applicationId,
      rowIndex,
      displayId: applicantDisplayId(rowIndex),
      candidateName: blind ? null : candidateName,
      fields: serializeApplicationFields(fields, settings, blind),
      existingScores,
      existingComment,
      scoreFields: settings.score_fields,
      customScoreFields: settings.custom_score_fields,
      blind,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
