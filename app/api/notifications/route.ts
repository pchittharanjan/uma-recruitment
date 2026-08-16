export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/auth';
import { initDb } from '@/lib/db';
import { requireTeamPortalUser } from '@/lib/impersonation';
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

async function resolveNotificationUser(req: NextRequest) {
  const portalUser = await requireTeamPortalUser(req);
  if (portalUser) return portalUser;
  return requireAuth(req);
}

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/notifications', async () => {
      try {
        await initDb();
        const user = await resolveNotificationUser(req);
        if (!user) return unauthorized();

        const countOnly = req.nextUrl.searchParams.get('countOnly') === '1';
        if (countOnly) {
          const unreadCount = await countUnreadNotifications(user.id);
          return NextResponse.json({ unreadCount });
        }

        const [notifications, unreadCount] = await Promise.all([
          listNotificationsForUser(user.id),
          countUnreadNotifications(user.id),
        ]);

        return NextResponse.json({
          notifications: notifications.map((n) => ({
            id: n.id,
            kind: n.kind,
            title: n.title,
            body: n.body,
            href: n.href,
            teamId: n.team_id,
            readAt: n.read_at,
            createdAt: n.created_at,
          })),
          unreadCount,
        });
      } catch (e) {
        console.error('GET /api/notifications failed:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }),
  );
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await resolveNotificationUser(req);
    if (!user) return unauthorized();

    const body = (await req.json()) as { action?: string; id?: number };
    if (body.action === 'read_all') {
      const updated = await markAllNotificationsRead(user.id);
      return NextResponse.json({ ok: true, updated });
    }

    if (body.action === 'read') {
      const id = typeof body.id === 'number' ? body.id : Number(body.id);
      if (!Number.isFinite(id) || id < 1) {
        return NextResponse.json({ error: 'Notification id is required.' }, { status: 400 });
      }
      await markNotificationRead(user.id, id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (e) {
    console.error('POST /api/notifications failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
