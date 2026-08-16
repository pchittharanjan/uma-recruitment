export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeams, initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  createUser,
  isAdminCreatableRole,
  listUsersWithTeams,
  UserAdminError,
} from '@/lib/users-admin';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/users', async () => {
      try {
        await initDb();
        const admin = await requireAuth(req, { roles: ['admin'] });
        if (!admin) return unauthorized();

        const [users, teams] = await Promise.all([listUsersWithTeams(), getTeams()]);

        return NextResponse.json({ users, teams });
      } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }),
  );
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name : '';
    const email = typeof body.email === 'string' ? body.email : '';
    const rawRole = typeof body.role === 'string' ? body.role : '';
    const role = rawRole === 'team_exec' ? 'exec' : rawRole;
    const teamIds = Array.isArray(body.teamIds)
      ? body.teamIds.filter((id: unknown) => typeof id === 'number')
      : [];
    const directorTeamIds = Array.isArray(body.directorTeamIds)
      ? body.directorTeamIds.filter((id: unknown) => typeof id === 'number')
      : [];

    if (!isAdminCreatableRole(role)) {
      return NextResponse.json({ error: 'Role must be admin or exec.' }, { status: 400 });
    }

    const user = await createUser({
      name,
      email,
      role,
      teamIds: role === 'exec' ? teamIds : [],
      directorTeamIds: role === 'exec' ? directorTeamIds : [],
      invitedBy: admin.id,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
