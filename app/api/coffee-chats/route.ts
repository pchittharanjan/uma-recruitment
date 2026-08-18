export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { forbidden, requireAuth, unauthorized } from '@/lib/auth';
import type { CoffeeChatInput } from '@/lib/coffee-chats';
import { isWithinCoffeeChatWindow, validateApplicantGradeLevel, validateApplicantEmail, validateTeamsInterested } from '@/lib/coffee-chats';
import {
  canUserAccessCoffeeChats,
  createCoffeeChat,
  listAllCoffeeChats,
  serializeAdminCoffeeChat,
} from '@/lib/coffee-chats-server';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getOrgCoffeeChatDates } from '@/lib/org-coffee-chat-dates';
import { isPipelineClosed, PIPELINE_CLOSED_MESSAGE, assertPipelineWritable } from '@/lib/pipeline-writable';

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
      return NextResponse.json({ chats: chats.map(serializeAdminCoffeeChat) });
    }

    const orgDates = await getOrgCoffeeChatDates();
    const windowConfigured = Boolean(orgDates.coffeeChatStartDate && orgDates.applicationDueDate);
    const windowOpen =
      windowConfigured &&
      isWithinCoffeeChatWindow({
        coffee_chat_start_date: orgDates.coffeeChatStartDate,
        application_due_date: orgDates.applicationDueDate,
      });
    const pipelineClosed = await isPipelineClosed();
    const access = await canUserAccessCoffeeChats(
      user.role === 'admin' ? { bypassWindow: true } : undefined,
    );
    const adminBypass = user.role === 'admin';

    const unavailableReason =
      adminBypass
        ? null
        : pipelineClosed
          ? PIPELINE_CLOSED_MESSAGE
          : windowOpen
            ? null
            : windowConfigured
              ? 'Coffee chat submissions are closed outside the configured date window.'
              : 'Coffee chat submissions are closed until an admin sets the coffee chat start and due dates.';

    return NextResponse.json({
      coffeeChatWindow: {
        coffeeChatStartDate: orgDates.coffeeChatStartDate,
        applicationDueDate: orgDates.applicationDueDate,
        configured: windowConfigured,
        open: windowOpen && !pipelineClosed,
      },
      pipelineClosed: pipelineClosed && !adminBypass,
      unavailableReason:
        adminBypass || (access.allowed && !pipelineClosed) ? null : unavailableReason,
    });
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
