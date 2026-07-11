export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
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
    if (!settings) {
      return NextResponse.json({ error: 'Round not configured.' }, { status: 400 });
    }

    const db = getDb();
    const appsResult = await db.execute({
      sql: `SELECT app.id, app.row_index, app.fields, app.final_score, app.rank,
                   asgn.id as assignment_id, asgn.user_id, u.name as grader_name
            FROM applications app
            LEFT JOIN assignments asgn ON asgn.application_id = app.id AND asgn.stage = 'application'
            LEFT JOIN users u ON u.id = asgn.user_id
            WHERE app.team_id = ? AND app.round_id = ?
            ORDER BY app.rank ASC NULLS LAST, app.row_index ASC, asgn.id ASC`,
      args: [teamId, round.id],
    });

    const scoresResult = await db.execute({
      sql: `SELECT s.assignment_id, s.field_name, s.score FROM scores s
            JOIN assignments a ON a.id = s.assignment_id
            JOIN applications app ON app.id = a.application_id
            WHERE app.team_id = ? AND app.round_id = ?`,
      args: [teamId, round.id],
    });

    const scoresByAssignment: Record<number, Record<string, number>> = {};
    for (const row of scoresResult.rows) {
      const aid = row.assignment_id as number;
      if (!scoresByAssignment[aid]) scoresByAssignment[aid] = {};
      scoresByAssignment[aid][row.field_name as string] = row.score as number;
    }

    const appMap = new Map<
      number,
      {
        rank: number | null;
        finalScore: number | null;
        fields: Record<string, string>;
        graders: Array<{ name: string; scores: Record<string, number>; total: number }>;
      }
    >();

    for (const row of appsResult.rows) {
      const appId = row.id as number;
      if (!appMap.has(appId)) {
        appMap.set(appId, {
          rank: row.rank as number | null,
          finalScore: row.final_score as number | null,
          fields: JSON.parse(row.fields as string),
          graders: [],
        });
      }
      if (row.assignment_id !== null) {
        const scores = scoresByAssignment[row.assignment_id as number] ?? {};
        const total = Object.values(scores).reduce((a, b) => a + b, 0);
        appMap.get(appId)!.graders.push({
          name: row.grader_name as string,
          scores,
          total,
        });
      }
    }

    const allScoreFields = [...settings.score_fields, ...settings.custom_score_fields];
    const csvRows = Array.from(appMap.values()).map((app) => {
      const row: Record<string, string | number | null> = {
        rank: app.rank,
        final_score: app.finalScore !== null ? Math.round(app.finalScore * 100) / 100 : null,
        ...app.fields,
      };
      app.graders.forEach((g, i) => {
        row[`grader_${i + 1}_name`] = g.name;
        row[`grader_${i + 1}_total`] = g.total;
        for (const field of allScoreFields) {
          row[`grader_${i + 1}_${field}`] = g.scores[field] ?? null;
        }
      });
      return row;
    });

    const csv = Papa.unparse(csvRows);
    const filename = `${team.name.toLowerCase()}-results.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
