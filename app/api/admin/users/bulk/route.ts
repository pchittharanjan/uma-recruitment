export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { createUser, isAdminCreatableRole, UserAdminError } from '@/lib/users-admin';

interface BulkRequestRow {
  name: string;
  email: string;
  role: string;
  teamIds: number[];
  directorTeamIds: number[];
  rowNumber?: number;
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const body = await req.json();
    const rows = Array.isArray(body.rows) ? (body.rows as BulkRequestRow[]) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Provide at least one row.' }, { status: 400 });
    }

    const results: Array<{
      rowNumber: number;
      name: string;
      email: string;
      success: boolean;
      error?: string;
      user?: { id: number; name: string; email: string; role: string };
    }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const role = row.role === 'team_exec' ? 'exec' : row.role;
      const teamIds = Array.isArray(row.teamIds)
        ? row.teamIds.filter((id) => typeof id === 'number')
        : [];
      const directorTeamIds = Array.isArray(row.directorTeamIds)
        ? row.directorTeamIds.filter((id) => typeof id === 'number')
        : [];

      if (!isAdminCreatableRole(role)) {
        results.push({
          rowNumber: row.rowNumber ?? index + 1,
          name: typeof row.name === 'string' ? row.name : '',
          email: typeof row.email === 'string' ? row.email : '',
          success: false,
          error: 'Role must be admin or exec.',
        });
        continue;
      }

      try {
        const created = await createUser({
          name: typeof row.name === 'string' ? row.name : '',
          email: typeof row.email === 'string' ? row.email : '',
          role,
          teamIds: role === 'exec' ? teamIds : [],
          directorTeamIds: role === 'exec' ? directorTeamIds : [],
          invitedBy: admin.id,
        });

        results.push({
          rowNumber: row.rowNumber ?? index + 1,
          name: created.name,
          email: created.email,
          success: true,
          user: {
            id: created.id,
            name: created.name,
            email: created.email,
            role: created.role,
          },
        });
      } catch (error) {
        results.push({
          rowNumber: row.rowNumber ?? index + 1,
          name: typeof row.name === 'string' ? row.name : '',
          email: typeof row.email === 'string' ? row.email : '',
          success: false,
          error:
            error instanceof UserAdminError
              ? error.message
              : 'Unexpected error while creating this user.',
        });
      }
    }

    const createdCount = results.filter((row) => row.success).length;
    return NextResponse.json({
      createdCount,
      failedCount: results.length - createdCount,
      results,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
