export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundCount, getOrgCoffeeChatDates, saveOrgCoffeeChatDates } from '@/lib/org-coffee-chat-dates';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const [dates, activeRoundCount] = await Promise.all([
      getOrgCoffeeChatDates(),
      getActiveRoundCount(),
    ]);
    return NextResponse.json({
      activeRoundCount,
      coffeeChatStartDate: dates.coffeeChatStartDate,
      applicationDueDate: dates.applicationDueDate,
    });
  } catch (e) {
    console.error('GET /api/admin/coffee-chat-dates failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const body = (await req.json()) as {
      coffeeChatStartDate?: string | null;
      applicationDueDate?: string | null;
    };

    const dates = await saveOrgCoffeeChatDates({
      coffeeChatStartDate: body.coffeeChatStartDate ?? null,
      applicationDueDate: body.applicationDueDate ?? null,
    });

    const [activeRoundCount] = await Promise.all([getActiveRoundCount()]);
    return NextResponse.json({
      activeRoundCount,
      coffeeChatStartDate: dates.coffeeChatStartDate,
      applicationDueDate: dates.applicationDueDate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (message.includes('date') || message.includes('YYYY')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('PATCH /api/admin/coffee-chat-dates failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
