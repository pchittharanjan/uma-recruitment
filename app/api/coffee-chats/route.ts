export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { forbidden, requireAuth, unauthorized } from '@/lib/auth';
import type { CoffeeChatInput } from '@/lib/coffee-chats';
import { validateApplicantGradeLevel, validateApplicantEmail, validateTeamsInterested } from '@/lib/coffee-chats';
import {
  createCoffeeChat,
  listAllCoffeeChats,
  serializeAdminCoffeeChat,
} from '@/lib/coffee-chats-server';
import { matchStatusForCoffeeChats } from '@/lib/coffee-chat-import-server';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

async function resolveCoffeeChatUser(req: NextRequest) {
  const portalUser = await requireTeamPortalUser(req);
  if (portalUser) return portalUser;
  return requireAuth(req);
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const user = await resolveCoffeeChatUser(req);
    if (!user) return unauthorized();

    const { searchParams } = req.nextUrl;
    const view = searchParams.get('view');

    if (user.role === 'admin' && view === 'all') {
      const chats = await listAllCoffeeChats();
      const matches = await matchStatusForCoffeeChats(chats);
      return NextResponse.json({
        chats: chats.map((chat, index) => serializeAdminCoffeeChat(chat, matches[index])),
      });
    }

    // Member in-app entry was removed — Google Form + admin sheet upload only.
    return NextResponse.json(
      { error: 'Coffee chat notes are imported by admins from the Google Form sheet.' },
      { status: 410 },
    );
  } catch (e) {
    console.error('GET /api/coffee-chats failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await resolveCoffeeChatUser(req);
    if (!user) return unauthorized();
    if (user.role !== 'admin') {
      return forbidden('Coffee chat notes are imported by admins from the Google Form sheet.');
    }
    const closed = await assertPipelineWritable(user);
    if (closed) return closed;

    const body = (await req.json()) as CoffeeChatInput;
    if (!body.chatDate || !body.applicantName) {
      return NextResponse.json(
        { error: 'chatDate and applicantName are required.' },
        { status: 400 },
      );
    }

    try {
      validateApplicantGradeLevel(body.applicantGradeLevel);
      validateApplicantEmail(body.applicantEmail);
      validateTeamsInterested(body.teamsInterested);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid coffee chat input.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const chat = await createCoffeeChat(user, body);
    return NextResponse.json({ chat }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (message.includes('closed')) {
      return forbidden(message);
    }
    if (message.includes('not found') || message.includes('required') || message.includes('date') || message.includes('grade level') || message.includes('team')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('POST /api/coffee-chats failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
