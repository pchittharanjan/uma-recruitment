export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam, getRoundSettings } from '@/lib/rounds';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const settings = await getRoundSettings(round.id);
    const db = getDb();

    const gradersResult = await db.execute({
      sql: `SELECT u.id, u.name, u.email,
                   COUNT(a.id) as total,
                   SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM users u
            JOIN assignments a ON a.user_id = u.id
            JOIN applications app ON app.id = a.application_id
            WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'
            GROUP BY u.id
            ORDER BY u.name ASC`,
      args: [teamId, round.id],
    });

    const assignmentsResult = await db.execute({
      sql: `SELECT a.id as assignment_id, a.user_id, a.status,
                   app.id as application_id, app.row_index, app.fields
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'
            ORDER BY app.row_index ASC`,
      args: [teamId, round.id],
    });

    const graders = gradersResult.rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      email: r.email as string,
      total: r.total as number,
      completed: r.completed as number,
      assignments: assignmentsResult.rows
        .filter((a) => a.user_id === r.id)
        .map((a) => ({
          assignmentId: a.assignment_id as number,
          applicationId: a.application_id as number,
          rowIndex: (a.row_index as number | null) ?? 0,
          fields: JSON.parse(a.fields as string) as Record<string, string>,
          status: a.status as string,
        })),
    }));

    return NextResponse.json({
      team,
      round,
      graders,
      csvHeaders: settings?.csv_headers ?? [],
      scoreFields: settings?.score_fields ?? [],
      status: round.status,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
