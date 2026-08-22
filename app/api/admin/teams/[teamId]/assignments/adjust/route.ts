export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { assertPipelineWritable } from '@/lib/pipeline-writable';
import {
  moveRemainingAssignments,
  rebalanceTeamAssignments,
  setGraderAssignmentLoad,
} from '@/lib/assignment-admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const body = await req.json();
    const action = body?.action;

    try {
      if (action === 'rebalance') {
        const result = await rebalanceTeamAssignments(teamId);
        return NextResponse.json({ success: true, ...result });
      }

      if (action === 'set_load') {
        const userId = body?.userId;
        const target = body?.target;
        if (!userId || typeof userId !== 'number') {
          return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }
        if (typeof target !== 'number' || !Number.isInteger(target)) {
          return NextResponse.json({ error: 'target must be a whole number.' }, { status: 400 });
        }
        const result = await setGraderAssignmentLoad(teamId, userId, target);
        return NextResponse.json({ success: true, ...result });
      }

      if (action === 'move_remaining') {
        const fromUserId = body?.fromUserId;
        const toUserIds = body?.toUserIds;
        const count = body?.count;
        const includeInProgress = body?.includeInProgress === true;
        if (!fromUserId || typeof fromUserId !== 'number') {
          return NextResponse.json({ error: 'fromUserId is required' }, { status: 400 });
        }
        if (!Array.isArray(toUserIds) || toUserIds.some((id) => typeof id !== 'number')) {
          return NextResponse.json({ error: 'Pick at least one person to assign to.' }, { status: 400 });
        }
        if (typeof count !== 'number' || !Number.isInteger(count)) {
          return NextResponse.json({ error: 'count must be a whole number.' }, { status: 400 });
        }
        const result = await moveRemainingAssignments(
          teamId,
          fromUserId,
          toUserIds,
          count,
          includeInProgress,
        );
        return NextResponse.json({ success: true, ...result });
      }

      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not update assignments.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
