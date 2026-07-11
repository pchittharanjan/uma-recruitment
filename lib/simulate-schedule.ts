import {
  autoAssignInterviewSlots,
  getEffectiveInterviewScheduleConfig,
  interviewFormatForTeam,
  saveTeamInterviewDaySettings,
} from '@/lib/interview-schedule-config';
import { getTeamById } from '@/lib/db';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  listInterviewCandidates,
  listTeamInterviewers,
  saveInterviewSchedule,
  type InterviewSlotInput,
  type InterviewSlotStage,
} from '@/lib/interview-slots';

export interface SimulateScheduleResult {
  slotsAssigned: number;
  sessionsCreated: number;
  interviewersAssigned: number;
  dateEnsured: boolean;
}

function defaultInterviewDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sessionKeyForSlot(slot: InterviewSlotInput): string {
  const groupKey = slot.groupKey?.trim();
  if (groupKey) return `${slot.scheduledAt}|${groupKey}`;
  return `${slot.scheduledAt}|solo-${slot.applicationId}`;
}

/** Assign interviewers to auto-built slots without double-booking at the same time. */
export function assignInterviewersToSimulatedSlots(
  slots: InterviewSlotInput[],
  interviewerIds: number[],
  interviewersPerSession = 1,
): InterviewSlotInput[] {
  if (interviewerIds.length === 0 || slots.length === 0) return slots;

  const perSession = Math.max(1, Math.min(interviewersPerSession, interviewerIds.length));
  const bookedAtTime = new Map<string, Set<number>>();
  const sessionInterviewers = new Map<string, number[]>();
  let cursor = 0;

  const sessionOrder: string[] = [];
  for (const slot of slots) {
    const key = sessionKeyForSlot(slot);
    if (!sessionInterviewers.has(key)) {
      sessionInterviewers.set(key, []);
      sessionOrder.push(key);
    }
  }

  for (const key of sessionOrder) {
    const scheduledAt = key.split('|')[0]!;
    if (!bookedAtTime.has(scheduledAt)) bookedAtTime.set(scheduledAt, new Set());
    const booked = bookedAtTime.get(scheduledAt)!;
    const chosen: number[] = [];

    for (let attempt = 0; attempt < interviewerIds.length && chosen.length < perSession; attempt++) {
      const id = interviewerIds[(cursor + attempt) % interviewerIds.length]!;
      if (booked.has(id) || chosen.includes(id)) continue;
      chosen.push(id);
      booked.add(id);
    }

    cursor = (cursor + Math.max(chosen.length, 1)) % interviewerIds.length;
    sessionInterviewers.set(key, chosen);
  }

  return slots.map((slot) => ({
    ...slot,
    interviewerIds: sessionInterviewers.get(sessionKeyForSlot(slot)) ?? [],
  }));
}

export async function simulateTeamInterviewSchedule(
  teamId: number,
  stage: InterviewSlotStage,
): Promise<SimulateScheduleResult> {
  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found');

  const round = await getActiveRoundForTeam(teamId);
  if (!round) throw new Error('No active round for this team.');
  if (round.status === 'closed') throw new Error('Round is already closed.');

  const candidates = await listInterviewCandidates(teamId, round.id, stage);
  if (candidates.length === 0) {
    throw new Error('No applicants in this stage yet. Advance applicants first.');
  }

  const interviewers = await listTeamInterviewers(teamId);
  if (interviewers.length === 0) {
    throw new Error('No interviewers available for this team.');
  }

  let config = await getEffectiveInterviewScheduleConfig(teamId);
  const currentDate =
    stage === 'first_round' ? config.firstRoundDate : config.finalRoundDate;
  let dateEnsured = false;

  if (!currentDate) {
    await saveTeamInterviewDaySettings(teamId, stage, {
      interviewDate: defaultInterviewDate(),
    });
    config = await getEffectiveInterviewScheduleConfig(teamId);
    dateEnsured = true;
  }

  const format = interviewFormatForTeam(team.name, stage);
  const baseSlots = autoAssignInterviewSlots(candidates, config, stage, format);
  const interviewersPerSession = format === 'group' ? Math.min(2, interviewers.length) : 1;
  const slots = assignInterviewersToSimulatedSlots(
    baseSlots,
    interviewers.map((iv) => iv.id),
    interviewersPerSession,
  );

  await saveInterviewSchedule(teamId, round.id, stage, slots);

  const sessionsCreated = new Set(slots.map(sessionKeyForSlot)).size;
  const interviewersAssigned = new Set(slots.flatMap((s) => s.interviewerIds)).size;

  return {
    slotsAssigned: slots.length,
    sessionsCreated,
    interviewersAssigned,
    dateEnsured,
  };
}
