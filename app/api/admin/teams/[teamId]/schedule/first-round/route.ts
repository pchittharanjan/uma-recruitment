export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import {
  autoAssignInterviewSlots,
  blocksForStage,
  getEffectiveInterviewScheduleConfig,
  interviewFormatForTeam,
  mergeCandidateSlotRows,
  saveTeamInterviewDaySettings,
} from '@/lib/interview-schedule-config';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  getInterviewSlotsForRound,
  listInterviewCandidates,
  listTeamInterviewers,
  saveInterviewSchedule,
  type InterviewSlotInput,
  type InterviewSlotStage,
} from '@/lib/interview-slots';
import { InterviewScheduleValidationError } from '@/lib/interview-schedule-validation';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

async function loadSchedule(teamId: number, stage: InterviewSlotStage) {
  const team = await getTeamById(teamId);
  if (!team) return null;

  const round = await getActiveRoundForTeam(teamId);
  if (!round) return { error: 'No active round for this team.', status: 404 as const };

  const interviewFormat = interviewFormatForTeam(team.name, stage);
  const [candidates, interviewers, slots, scheduleConfig] = await Promise.all([
    listInterviewCandidates(teamId, round.id, stage),
    listTeamInterviewers(teamId),
    getInterviewSlotsForRound(teamId, round.id, stage),
    getEffectiveInterviewScheduleConfig(teamId),
  ]);

  const timeBlocks = blocksForStage(
    scheduleConfig,
    stage,
    candidates.length,
    interviewFormat,
  );

  const mergedSlots = mergeCandidateSlotRows(candidates, slots);

  return {
    team,
    round: { id: round.id, label: round.label, status: round.status },
    candidates,
    interviewers,
    slots: mergedSlots,
    scheduleConfig,
    interviewFormat,
    timeBlocks,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const result = await loadSchedule(teamId, 'first_round');
    if (!result) return notFound('Team not found');
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      action?: 'autoAssign';
      slots?: InterviewSlotInput[];
    };

    if (body.action === 'autoAssign') {
      const config = await getEffectiveInterviewScheduleConfig(teamId);
      const format = interviewFormatForTeam(team.name, 'first_round');
      const candidates = await listInterviewCandidates(teamId, round.id, 'first_round');
      const existingSlots = await getInterviewSlotsForRound(teamId, round.id, 'first_round');
      const existingByApp = new Map(existingSlots.map((s) => [s.applicationId, s]));

      const autoSlots = autoAssignInterviewSlots(candidates, config, 'first_round', format).map(
        (slot) => {
          const existing = existingByApp.get(slot.applicationId);
          return {
            ...slot,
            location: existing?.location ?? slot.location,
            logisticsNote: existing?.logisticsNote && !/^Group \d+ at /.test(existing.logisticsNote.trim())
              ? existing.logisticsNote
              : '',
            interviewerIds: existing?.interviewerIds ?? slot.interviewerIds,
          };
        },
      );

      await saveInterviewSchedule(teamId, round.id, 'first_round', autoSlots);
      return NextResponse.json({ success: true });
    }

    if (body.slots) {
      await saveInterviewSchedule(teamId, round.id, 'first_round', body.slots);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    if (e instanceof InterviewScheduleValidationError) {
      return NextResponse.json(
        { error: e.message, conflicts: e.validation.conflicts },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      interviewDate?: string | null;
      startTime?: string;
      blockMinutes?: number;
    };

    const scheduleConfig = await saveTeamInterviewDaySettings(teamId, 'first_round', {
      interviewDate: body.interviewDate,
      startTime: body.startTime,
      blockMinutes: body.blockMinutes,
    });

    const candidates = await listInterviewCandidates(teamId, round.id, 'first_round');
    const interviewFormat = interviewFormatForTeam(team.name, 'first_round');
    const timeBlocks = blocksForStage(
      scheduleConfig,
      'first_round',
      candidates.length,
      interviewFormat,
    );

    return NextResponse.json({ scheduleConfig, timeBlocks });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
