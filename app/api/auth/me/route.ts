export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getAccessibleTeams } from '@/lib/access';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getImpersonateTargetFromRequest } from '@/lib/impersonation';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const sessionUser = await getSessionUserFromRequest(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const impersonateTarget = await getImpersonateTargetFromRequest(req);

    if (impersonateTarget && sessionUser.role === 'admin') {
      const teams = await getAccessibleTeams(impersonateTarget);
      return NextResponse.json({
        user: {
          id: impersonateTarget.id,
          email: impersonateTarget.email,
          name: impersonateTarget.name,
          role: impersonateTarget.role,
        },
        teams,
        impersonation: {
          active: true,
          admin: {
            id: sessionUser.id,
            email: sessionUser.email,
            name: sessionUser.name,
          },
        },
      });
    }

    const teams = await getAccessibleTeams(sessionUser);
    return NextResponse.json({
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        role: sessionUser.role,
      },
      teams,
      impersonation: null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
