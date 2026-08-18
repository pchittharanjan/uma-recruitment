export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { forbidden, requireAuth, unauthorized } from '@/lib/auth';
import type { CoffeeChatUpdateInput } from '@/lib/coffee-chats';
import { validateApplicantGradeLevel, validateApplicantEmail, validateTeamsInterested } from '@/lib/coffee-chats';
import { updateCoffeeChat } from '@/lib/coffee-chats-server';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

async function resolveCoffeeChatUser(req: NextRequest) {
  const portalUser = await requireTeamPortalUser(req);
  if (portalUser) return portalUser;
  return requireAuth(req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initDb();
    const user = await resolveCoffeeChatUser(req);
    if (!user) return unauthorized();
    const closed = await assertPipelineWritable(user);
    if (closed) return closed;

    const { id: idRaw } = await params;
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }

    const body = (await req.json()) as CoffeeChatUpdateInput;

    try {
      if (body.applicantGradeLevel !== undefined) {
        validateApplicantGradeLevel(body.applicantGradeLevel);
      }
      if (body.applicantEmail !== undefined) {
        validateApplicantEmail(body.applicantEmail);
      }
      if (body.teamsInterested !== undefined) {
        validateTeamsInterested(body.teamsInterested);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid coffee chat input.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const chat = await updateCoffeeChat(user, id, body);
    return NextResponse.json({ chat });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (message.includes('only edit your own') || message.includes('edit window') || message.includes('closed')) {
      return forbidden(message);
    }
    if (message.includes('not found') || message.includes('required') || message.includes('date') || message.includes('grade level') || message.includes('team')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('PATCH /api/coffee-chats/[id] failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
