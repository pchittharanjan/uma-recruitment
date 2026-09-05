export const runtime = 'nodejs';

import { mkdir, readdir, writeFile } from 'fs/promises';
import path from 'path';
import { list, put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { normalizeCasePdfUrl, type InterviewGuideStage } from '@/lib/interview-guide';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];
const MAX_BYTES = 12 * 1024 * 1024;
const BLOB_PREFIX = 'interview-cases/';

function isInterviewGuideStage(value: string): value is InterviewGuideStage {
  return STAGES.includes(value as InterviewGuideStage);
}

function casesDir() {
  return path.join(process.cwd(), 'public', 'interview-cases');
}

function casePdfFilename(teamId: number, stage: InterviewGuideStage) {
  return `team-${teamId}-${stage}.pdf`;
}

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function isReadOnlyFsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM';
}

async function listLocalCasePdfs(): Promise<Array<{ name: string; url: string }>> {
  const dir = casesDir();
  try {
    const entries = await readdir(dir);
    return entries
      .filter((name) => name.toLowerCase().endsWith('.pdf'))
      .sort()
      .map((name) => ({ name, url: `/interview-cases/${name}` }));
  } catch {
    return [];
  }
}

async function listBlobCasePdfs(): Promise<Array<{ name: string; url: string }>> {
  const files: Array<{ name: string; url: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor });
    for (const blob of page.blobs) {
      const name = blob.pathname.replace(BLOB_PREFIX, '');
      if (!name.toLowerCase().endsWith('.pdf')) continue;
      files.push({ name, url: blob.url });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return files.sort((a, b) => a.name.localeCompare(b.name));
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

    const local = await listLocalCasePdfs();
    const remote = blobConfigured() ? await listBlobCasePdfs() : [];
    const byName = new Map<string, { name: string; url: string }>();
    for (const file of [...local, ...remote]) {
      byName.set(file.name, file);
    }

    return NextResponse.json({
      files: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
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

    const filename = casePdfFilename(teamId, stageRaw);
    const buffer = Buffer.from(await file.arrayBuffer());

    let casePdfUrl: string | undefined;

    if (blobConfigured()) {
      const blob = await put(`${BLOB_PREFIX}${filename}`, buffer, {
        access: 'public',
        contentType: 'application/pdf',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      casePdfUrl = normalizeCasePdfUrl(blob.url);
    } else {
      try {
        const dir = casesDir();
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
        casePdfUrl = normalizeCasePdfUrl(`/interview-cases/${filename}`);
      } catch (error) {
        console.error(error);
        if (isReadOnlyFsError(error) || process.env.VERCEL) {
          return NextResponse.json(
            {
              error:
                'PDF upload needs Vercel Blob on this host. Add a Blob store and set BLOB_READ_WRITE_TOKEN, then try again.',
            },
            { status: 503 },
          );
        }
        throw error;
      }
    }

    if (!casePdfUrl) {
      return NextResponse.json({ error: 'Could not store PDF.' }, { status: 500 });
    }

    return NextResponse.json({ casePdfUrl, filename });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
