export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam, getRoundSettings } from '@/lib/rounds';
import {
  graderContextFieldsForSettings,
  serializeApplicationFields,
} from '@/lib/team-dashboard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; applicationId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw, applicationId: appIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(teamId) || !Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round.' }, { status: 404 });
    }

    const settings = await getRoundSettings(round.id);
    if (!settings) {
      return NextResponse.json({ error: 'Round not configured.' }, { status: 404 });
    }

    const db = getDb();
    const appResult = await db.execute({
      sql: `SELECT id, row_index, fields FROM applications
            WHERE id = ? AND team_id = ? AND round_id = ?`,
      args: [applicationId, teamId, round.id],
    });
    if (appResult.rows.length === 0) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const row = appResult.rows[0];
    const fields = JSON.parse(row.fields as string) as Record<string, string>;
    const rowIndex = (row.row_index as number | null) ?? 0;

    return NextResponse.json({
      applicationId,
      rowIndex,
      fields: serializeApplicationFields(fields, settings, true),
      scoreFields: settings.score_fields,
      customScoreFields: settings.custom_score_fields,
      contextFields: graderContextFieldsForSettings(settings),
      graderInstructions: settings.grader_instructions,
      preview: true,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
