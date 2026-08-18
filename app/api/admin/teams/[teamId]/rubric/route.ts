export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam, getRoundSettings, updateRoundRubric } from '@/lib/rounds';
import { graderVisibleContextFields, resolveContextFields } from '@/lib/blind';
import { graderContextFieldsForSettings } from '@/lib/team-dashboard';
import { getOrgRubric, mergeOrgRubricIntoHeaders, propagateOrgRubricToActiveRounds, saveOrgRubric } from '@/lib/org-rubric';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const settings = await getRoundSettings(round.id);
    if (!settings) {
      return NextResponse.json({ error: 'Round not configured.' }, { status: 404 });
    }

    const orgRubric = await getOrgRubric();
    const orgMerged = orgRubric
      ? mergeOrgRubricIntoHeaders(orgRubric, settings.csv_headers)
      : null;

    const contextFields = resolveContextFields(settings);
    const graderVisibleContext = graderVisibleContextFields(contextFields);

    return NextResponse.json({
      roundId: round.id,
      roundLabel: round.label,
      roundStatus: round.status,
      // Admin retains write access after close; teams are view-only separately.
      readOnly: false,
      csvHeaders: settings.csv_headers,
      scoreFields: orgMerged?.score_fields.length ? orgMerged.score_fields : settings.score_fields,
      customScoreFields: orgMerged?.custom_score_fields.length
        ? orgMerged.custom_score_fields
        : settings.custom_score_fields,
      portfolioFields: settings.portfolio_fields,
      contextFields,
      graderVisibleContextFields: graderVisibleContext,
      graderInstructions: orgMerged?.grader_instructions ?? settings.grader_instructions,
      gradersPerApplication: settings.graders_per_application,
      orgWide: true,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      scoreFields?: string[];
      customScoreFields?: string[];
      contextFields?: string[];
      graderInstructions?: string | null;
    };

    const updated = await updateRoundRubric(round.id, teamId, {
      scoreFields: body.scoreFields ?? [],
      customScoreFields: body.customScoreFields ?? [],
      contextFields: body.contextFields ?? [],
      graderInstructions: body.graderInstructions ?? null,
    });

    const orgPayload = {
      score_fields: updated.score_fields,
      custom_score_fields: updated.custom_score_fields,
      grader_instructions: updated.grader_instructions,
    };
    await saveOrgRubric(orgPayload);
    await propagateOrgRubricToActiveRounds(orgPayload);

    return NextResponse.json({
      scoreFields: updated.score_fields,
      customScoreFields: updated.custom_score_fields,
      portfolioFields: updated.portfolio_fields,
      contextFields: resolveContextFields(updated),
      graderVisibleContextFields: graderContextFieldsForSettings(updated),
      graderInstructions: updated.grader_instructions,
      orgWide: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error.';
    const status = message.includes('At least') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
