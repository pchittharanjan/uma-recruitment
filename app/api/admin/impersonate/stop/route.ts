export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { clearImpersonationCookies, getImpersonateTargetFromRequest } from '@/lib/impersonation';
import { requireAuth, unauthorized } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    if (!(await getImpersonateTargetFromRequest(req))) {
      return NextResponse.json({ error: 'Not in test mode.' }, { status: 400 });
    }

    const res = NextResponse.json({ success: true });
    clearImpersonationCookies(res);
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
