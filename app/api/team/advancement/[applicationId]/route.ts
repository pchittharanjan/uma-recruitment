export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTeamById, initDb } from '@/lib/db';
import { applicantDisplayId } from '@/lib/blind';
import { extractCandidateFromFields } from '@/lib/candidates';
import { forbidden, unauthorized } from '@/lib/auth';
import { userHasTeamAccess } from '@/lib/access';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam, getRoundSettings } from '@/lib/rounds';
import {
  getGraderAssignmentForUser,
  serializeApplicationFields,
  userSeesBlindApplications,
} from '@/lib/team-dashboard';
import {
  applicationQuestionLabels,
  loadAdvancementStageReviews,
} from '@/lib/advancement-stage-reviews';
import {
  criterionScoreKey,
  primaryScoredQuestions,
  questionsLinkedTo,
  resolveGradingRubric,
  responseFieldsForQuestion,
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

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const settings = await getRoundSettings(round.id);
    if (!settings) {
      return NextResponse.json({ error: 'Round not configured.' }, { status: 404 });
    }

    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
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
      /** Deprecated: viewer-only note; prefer graderReviews. */
      note: string | null;
      graderNotes: Array<{ graderName: string; note: string; isMine: boolean }>;
      graderScores: Array<{
        graderName: string;
        isMine: boolean;
        criteria: Array<{ key: string; name: string; score: number | null }>;
      }>;
    }> | null = null;
    let leftoverFields: Record<string, string> = displayFields;

    const questionLabels = applicationQuestionLabels(settings, team.name);
    const reviewsByApp = await loadAdvancementStageReviews({
      teamId,
      roundId: round.id,
      stage: 'application',
      applicationIds: [applicationId],
      questionLabels,
    });
    const allReviews = reviewsByApp.get(applicationId) ?? [];
    const myAssignment = await getGraderAssignmentForUser(user.id, applicationId, teamId);
    const myReview = allReviews.find((r) => r.userId === user.id) ?? null;

    if (myReview) {
      existingScores = myReview.scores;
      existingComment = myReview.comment;
      questionNotes = myReview.questionNotes;
    } else if (myAssignment) {
      existingComment = myAssignment.comment || null;
    }

    const graderReviews = allReviews.map((review) => ({
      graderName: review.reviewerName,
      status: review.status,
      comment: review.comment,
      questionNotes: review.questionNotes,
      scores: review.scores,
      average: review.average,
      isMine: review.userId === user.id,
    }));

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

        const criteriaTemplate = question.criteria.map((criterion) => ({
          key: criterionScoreKey(question.id, criterion.id),
          name: criterion.name,
        }));

        const graderNotes = allReviews
          .map((review) => {
            const matched = review.questionNotes.find(
              (n) => n.label === question.label || n.label === question.id,
            );
            return matched?.note?.trim()
              ? {
                  graderName: review.reviewerName,
                  note: matched.note,
                  isMine: review.userId === user.id,
                }
              : null;
          })
          .filter((entry): entry is { graderName: string; note: string; isMine: boolean } =>
            Boolean(entry),
          );

        const graderScores = allReviews.map((review) => ({
          graderName: review.reviewerName,
          isMine: review.userId === user.id,
          criteria: criteriaTemplate.map((criterion) => ({
            key: criterion.key,
            name: criterion.name,
            score:
              review.scores[criterion.key] !== undefined
                ? review.scores[criterion.key]
                : null,
          })),
        }));

        const myNote =
          myReview?.questionNotes.find((n) => n.label === question.label)?.note?.trim() || null;

        questionReviews.push({
          id: question.id,
          label: question.label,
          responses,
          criteria: criteriaTemplate.map((criterion) => ({
            ...criterion,
            score:
              existingScores[criterion.key] !== undefined
                ? existingScores[criterion.key]
                : null,
          })),
          note: myNote,
          graderNotes,
          graderScores,
        });
      }

      leftoverFields = Object.fromEntries(
        Object.entries(displayFields).filter(([key]) => !usedFields.has(key)),
      );
    } else {
      for (const field of [...settings.score_fields, ...settings.custom_score_fields]) {
        scoreFieldLabels[field] = field;
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
      graderReviews,
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
