export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { listMyCoffeeChats, serializeUserCoffeeChat } from '@/lib/coffee-chats-server';
import { requireTeamPortalUser } from '@/lib/impersonation';

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

    const chats = await listMyCoffeeChats(user.id);
    return NextResponse.json({ chats: chats.map(serializeUserCoffeeChat) });
  } catch (e) {
    console.error('GET /api/coffee-chats/mine failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
