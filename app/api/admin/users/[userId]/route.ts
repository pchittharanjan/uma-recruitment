export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  deleteUser,
  isAdminCreatableRole,
  updateUser,
  UserAdminError,
} from '@/lib/users-admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const userId = Number.parseInt((await params).userId, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
    }

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

    const user = await updateUser({
      userId,
      name,
      email,
      role,
      teamIds: role === 'exec' ? teamIds : [],
      directorTeamIds: role === 'exec' ? directorTeamIds : [],
      updatedBy: admin.id,
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const userId = Number.parseInt((await params).userId, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
    }

    await deleteUser({ userId, deletedBy: admin.id });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
