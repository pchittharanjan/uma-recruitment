export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTeamById, initDb } from '@/lib/db';
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
import {
  criterionScoreKey,
  primaryScoredQuestions,
  questionsLinkedTo,
  resolveGradingRubric,
  responseFieldsForQuestion,
  splitScoreRows,
} from '@/lib/grading-model';

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

    const displayFields = serializeApplicationFields(fields, settings, blind);

    let existingScores: Record<string, number> = {};
    let existingComment: string | null = null;
    let questionNotes: Array<{ label: string; note: string }> = [];
    let scoreFieldLabels: Record<string, string> = {};
    let questionReviews: Array<{
      id: string;
      label: string;
      responses: Array<{ field: string; value: string }>;
      criteria: Array<{ key: string; name: string; score: number | null }>;
      note: string | null;
    }> | null = null;
    let leftoverFields: Record<string, string> = displayFields;

    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    if (assignment) {
      const scoresResult = await db.execute({
        sql: 'SELECT field_name, score, note FROM scores WHERE assignment_id = ?',
        args: [assignment.assignmentId],
      });
      const split = splitScoreRows(scoresResult.rows);
      existingScores = split.scores;
      existingComment = assignment.comment || null;

      const rubric = resolveGradingRubric(settings, team.name);
      if (rubric.usesCriterionRubric) {
        const usedFields = new Set<string>();
        questionReviews = [];

        for (const question of primaryScoredQuestions(rubric.applicationQuestions)) {
          const responses: Array<{ field: string; value: string }> = [];
          const pushResponseFields = (q: typeof question) => {
            for (const field of responseFieldsForQuestion(q)) {
              if (!(field in displayFields) || usedFields.has(field)) continue;
              usedFields.add(field);
              responses.push({ field, value: displayFields[field] ?? '' });
            }
          };
          pushResponseFields(question);
          for (const linked of questionsLinkedTo(rubric.applicationQuestions, question.id)) {
            pushResponseFields(linked);
          }

          const criteria = question.criteria.map((criterion) => {
            const key = criterionScoreKey(question.id, criterion.id);
            return {
              key,
              name: criterion.name,
              score:
                existingScores[key] !== undefined ? existingScores[key] : null,
            };
          });

          const note = split.notes[question.id]?.trim() || null;
          if (note) questionNotes.push({ label: question.label, note });

          questionReviews.push({
            id: question.id,
            label: question.label,
            responses,
            criteria,
            note,
          });
        }

        leftoverFields = Object.fromEntries(
          Object.entries(displayFields).filter(([key]) => !usedFields.has(key)),
        );
      } else {
        for (const field of [...settings.score_fields, ...settings.custom_score_fields]) {
          const note = split.notes[field]?.trim();
          if (note) questionNotes.push({ label: field, note });
          scoreFieldLabels[field] = field;
        }
      }
    }

    return NextResponse.json({
      applicationId,
      rowIndex,
      displayId: applicantDisplayId(rowIndex),
      candidateName: blind ? null : candidateName,
      fields: leftoverFields,
      existingScores,
      existingComment,
      questionNotes,
      questionReviews,
      scoreFields: settings.score_fields,
      customScoreFields: settings.custom_score_fields,
      scoreFieldLabels,
      blind,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
