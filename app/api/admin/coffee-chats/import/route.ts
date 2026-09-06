export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { assertPipelineWritable } from '@/lib/pipeline-writable';
import {
  parseCoffeeChatImportRows,
  suggestCoffeeChatColumnMap,
  validateCoffeeChatColumnMap,
  type CoffeeChatColumnMap,
  type CoffeeChatImportResolution,
} from '@/lib/coffee-chat-import';
import { importCoffeeChatsAsMatchedUsers } from '@/lib/coffee-chat-import-server';

interface ImportBody {
  rows?: Record<string, string>[];
  headers?: string[];
  columnMap?: CoffeeChatColumnMap;
  dryRun?: boolean;
  resolutions?: CoffeeChatImportResolution[];
}

function parseResolutions(raw: unknown): CoffeeChatImportResolution[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CoffeeChatImportResolution[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    const rowIndex = typeof row.rowIndex === 'number' ? row.rowIndex : Number(row.rowIndex);
    if (!Number.isFinite(rowIndex)) return null;
    const skip = row.skip === true;
    const userId =
      row.userId == null || row.userId === ''
        ? null
        : typeof row.userId === 'number'
          ? row.userId
          : Number(row.userId);
    const candidateId =
      row.candidateId == null || row.candidateId === ''
        ? null
        : typeof row.candidateId === 'number'
          ? row.candidateId
          : Number(row.candidateId);
    if (userId != null && !Number.isFinite(userId)) return null;
    if (candidateId != null && !Number.isFinite(candidateId)) return null;
    out.push({
      rowIndex,
      skip,
      userId: userId == null ? null : userId,
      candidateId: candidateId == null ? null : candidateId,
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();
    const closed = await assertPipelineWritable(admin);
    if (closed) return closed;

    const body = (await req.json()) as ImportBody;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const headers = Array.isArray(body.headers) ? body.headers : [];
    const dryRun = body.dryRun !== false;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import.' }, { status: 400 });
    }

    const columnMap =
      body.columnMap && Object.keys(body.columnMap).length > 0
        ? body.columnMap
        : suggestCoffeeChatColumnMap(headers);

    const mapError = validateCoffeeChatColumnMap(
      columnMap,
      headers.length > 0 ? headers : Object.keys(rows[0] ?? {}),
    );
    if (mapError) {
      return NextResponse.json({ error: mapError, columnMap }, { status: 400 });
    }

    const { parsed, errors: parseErrors } = parseCoffeeChatImportRows(rows, columnMap);
    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid coffee chat rows found in this file.',
          parseErrors,
          columnMap,
        },
        { status: 400 },
      );
    }

    let resolutions: CoffeeChatImportResolution[] | undefined;
    if (!dryRun) {
      const parsedResolutions = parseResolutions(body.resolutions);
      if (!parsedResolutions) {
        return NextResponse.json(
          { error: 'Import requires an explicit resolutions array for every row.' },
          { status: 400 },
        );
      }
      const covered = new Set(parsedResolutions.map((r) => r.rowIndex));
      const missing = parsed.filter((row) => !covered.has(row.rowIndex));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Missing resolutions for ${missing.length} row(s). Confirm, pick, or skip each row before importing.`,
          },
          { status: 400 },
        );
      }
      const unresolvedInBatch = parsedResolutions.filter((r) => {
        if (!parsed.some((row) => row.rowIndex === r.rowIndex)) return false;
        return !r.skip && r.userId == null;
      });
      if (unresolvedInBatch.length > 0) {
        return NextResponse.json(
          {
            error:
              'Every non-skipped row must include an explicit UMA userId. Confirm matches in the preview first.',
          },
          { status: 400 },
        );
      }
      resolutions = parsedResolutions;
    }

    const result = await importCoffeeChatsAsMatchedUsers(parsed, { dryRun, resolutions });

    return NextResponse.json({
      dryRun,
      columnMap,
      parseErrors,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      previews: result.previews,
      matchOptions: result.matchOptions,
      errors: [...parseErrors, ...result.errors],
    });
  } catch (e) {
    console.error('POST /api/admin/coffee-chats/import failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
