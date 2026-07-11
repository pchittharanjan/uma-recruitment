export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { buildInterviewResults } from '@/lib/interview-results';
import type { InterviewSlotStage } from '@/lib/interview-slots';

const INTERVIEW_STAGES: InterviewSlotStage[] = ['first_round', 'final_round'];

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

    const stageParam = req.nextUrl.searchParams.get('stage');
    const stage = (stageParam ?? round.status) as InterviewSlotStage;
    if (!INTERVIEW_STAGES.includes(stage) || round.status !== stage) {
      return NextResponse.json({ error: 'Interview export is not available for this phase.' }, { status: 400 });
    }

    const { candidates, scoreFields } = await buildInterviewResults(teamId, round.id, stage);

    const csvRows = candidates.map((candidate) => {
      const row: Record<string, string | number | null> = {
        rank: candidate.rank,
        applicant_name: candidate.candidateName,
        average_score:
          candidate.average !== null ? Math.round(candidate.average * 100) / 100 : null,
      };

      candidate.assignments.forEach((assignment, index) => {
        const prefix = `interviewer_${index + 1}`;
        row[`${prefix}_name`] = assignment.interviewerName;
        row[`${prefix}_status`] = assignment.status;
        row[`${prefix}_total`] = assignment.total;
        for (const field of scoreFields) {
          row[`${prefix}_${field}`] = assignment.scores[field] ?? null;
        }
        if (assignment.comment) {
          row[`${prefix}_comment`] = assignment.comment;
        }
      });

      return row;
    });

    const csv = Papa.unparse(csvRows);
    const stageSlug = stage === 'first_round' ? 'first-round' : 'final-round';
    const filename = `${team.name.toLowerCase()}-${stageSlug}-results.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/interview-results/export failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
