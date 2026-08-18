export const runtime = 'nodejs';

import { mkdir, readdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { normalizeCasePdfUrl, type InterviewGuideStage } from '@/lib/interview-guide';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];
const MAX_BYTES = 12 * 1024 * 1024;

function isInterviewGuideStage(value: string): value is InterviewGuideStage {
  return STAGES.includes(value as InterviewGuideStage);
}

function casesDir() {
  return path.join(process.cwd(), 'public', 'interview-cases');
}

function casePdfFilename(teamId: number, stage: InterviewGuideStage) {
  return `team-${teamId}-${stage}.pdf`;
}

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

    const dir = casesDir();
    let files: string[] = [];
    try {
      const entries = await readdir(dir);
      files = entries.filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
    } catch {
      files = [];
    }

    return NextResponse.json({
      files: files.map((name) => ({
        name,
        url: `/interview-cases/${name}`,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const formData = await req.formData();
    const file = formData.get('file');
    const stageRaw = formData.get('stage');

    if (typeof stageRaw !== 'string' || !isInterviewGuideStage(stageRaw)) {
      return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'PDF file is required.' }, { status: 400 });
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'PDF must be 12 MB or smaller.' }, { status: 400 });
    }

    const dir = casesDir();
    await mkdir(dir, { recursive: true });

    const filename = casePdfFilename(teamId, stageRaw);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    const casePdfUrl = normalizeCasePdfUrl(`/interview-cases/${filename}`);
    if (!casePdfUrl) {
      return NextResponse.json({ error: 'Could not store PDF.' }, { status: 500 });
    }

    return NextResponse.json({ casePdfUrl, filename });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
