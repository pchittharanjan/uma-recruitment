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
} from '@/lib/coffee-chat-import';
import { importCoffeeChatsAsMatchedUsers } from '@/lib/coffee-chat-import-server';

interface ImportBody {
  rows?: Record<string, string>[];
  headers?: string[];
  columnMap?: CoffeeChatColumnMap;
  dryRun?: boolean;
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

    const mapError = validateCoffeeChatColumnMap(columnMap, headers.length > 0 ? headers : Object.keys(rows[0] ?? {}));
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

    const result = await importCoffeeChatsAsMatchedUsers(parsed, { dryRun });

    return NextResponse.json({
      dryRun,
      columnMap,
      parseErrors,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      previews: result.previews,
      errors: [...parseErrors, ...result.errors],
    });
  } catch (e) {
    console.error('POST /api/admin/coffee-chats/import failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
