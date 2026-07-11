export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  formatRecruitmentCycleLabel,
  formatRecruitmentCycleShort,
  type RecruitmentSemester,
} from '@/lib/org-recruitment-cycle';
import {
  getOrgRecruitmentCycle,
  saveOrgRecruitmentCycle,
} from '@/lib/org-recruitment-cycle-server';
import { getActiveRoundCount } from '@/lib/org-coffee-chat-dates';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const [cycle, activeRoundCount] = await Promise.all([
      getOrgRecruitmentCycle(),
      getActiveRoundCount(),
    ]);

    return NextResponse.json({
      semester: cycle.semester,
      year: cycle.year,
      label: formatRecruitmentCycleLabel(cycle.semester, cycle.year),
      shortLabel: formatRecruitmentCycleShort(cycle.semester, cycle.year),
      activeRoundCount,
    });
  } catch (e) {
    console.error('GET /api/admin/recruitment-cycle failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const body = (await req.json()) as {
      semester?: RecruitmentSemester;
      year?: number;
    };

    if (!body.semester || body.year == null) {
      return NextResponse.json({ error: 'Semester and year are required.' }, { status: 400 });
    }

    const cycle = await saveOrgRecruitmentCycle({
      semester: body.semester,
      year: Number(body.year),
    });

    const activeRoundCount = await getActiveRoundCount();

    return NextResponse.json({
      semester: cycle.semester,
      year: cycle.year,
      label: formatRecruitmentCycleLabel(cycle.semester, cycle.year),
      shortLabel: formatRecruitmentCycleShort(cycle.semester, cycle.year),
      activeRoundCount,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (
      message.includes('Semester') ||
      message.includes('Year') ||
      message.includes('Fall') ||
      message.includes('Spring')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('PATCH /api/admin/recruitment-cycle failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
