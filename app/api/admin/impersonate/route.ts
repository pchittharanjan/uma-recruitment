export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getUserById, initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  canImpersonateUser,
  getImpersonateTargetFromRequest,
  setImpersonateAsCookie,
} from '@/lib/impersonation';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    if (await getImpersonateTargetFromRequest(req)) {
      return NextResponse.json(
        { error: 'Already in test mode. Exit test mode before switching users.' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const userId = body.userId as number | undefined;
    if (!userId || !Number.isFinite(userId)) {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    const target = await getUserById(userId);
    if (!target) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (!canImpersonateUser(target)) {
      return NextResponse.json(
        { error: 'You can only test as an Exec or Ad Hoc Exec.' },
        { status: 400 },
      );
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
      },
    });
    setImpersonateAsCookie(res, target.id);
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
