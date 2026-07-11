export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { importApplicationRound } from '@/lib/rounds';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

interface GraderInput {
  name: string;
  email: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const formData = await req.formData();
    const csvFile = formData.get('csv') as File | null;
    const gradersRaw = formData.get('graders') as string | null;
    const roundLabel = ((formData.get('roundLabel') as string | null) ?? '').trim();
    const graderInstructions = (formData.get('graderInstructions') as string | null) ?? undefined;

    if (!csvFile) return NextResponse.json({ error: 'CSV file is required.' }, { status: 400 });
    if (!gradersRaw) return NextResponse.json({ error: 'Graders list is required.' }, { status: 400 });

    let graderInputs: GraderInput[];
    try {
      graderInputs = JSON.parse(gradersRaw) as GraderInput[];
    } catch {
      return NextResponse.json({ error: 'Graders must be valid JSON.' }, { status: 400 });
    }

    let scoreFields: string[] = [];
    const scoreFieldsRaw = formData.get('scoreFields') as string | null;
    if (scoreFieldsRaw) {
      try {
        scoreFields = JSON.parse(scoreFieldsRaw) as string[];
      } catch {
        scoreFields = [];
      }
    }

    let customScoreFields: string[] = [];
    const customRaw = formData.get('customScoreFields') as string | null;
    if (customRaw) {
      try {
        customScoreFields = JSON.parse(customRaw) as string[];
      } catch {
        customScoreFields = [];
      }
    }

    const csvText = await csvFile.text();

    const gradersPerApplicationRaw = formData.get('gradersPerApplication') as string | null;
    const parsedGradersPerApplication = gradersPerApplicationRaw
      ? Number.parseInt(gradersPerApplicationRaw, 10)
      : undefined;

    const result = await importApplicationRound({
      teamId,
      roundLabel: roundLabel || 'Application Round',
      csvText,
      scoreFields,
      customScoreFields,
      graderInputs,
      graderInstructions,
      gradersPerApplication:
        Number.isFinite(parsedGradersPerApplication) && parsedGradersPerApplication! >= 1
          ? parsedGradersPerApplication
          : undefined,
    });

    return NextResponse.json({
      teamId: result.team.id,
      teamName: result.team.name,
      roundId: result.round.id,
      roundLabel: result.round.label,
      applicationCount: result.applicationCount,
      graderCount: result.graderCount,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error.';
    const status = message.includes('already has') ? 409 : message.includes('No user') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
