import { getDb } from '@/lib/db';
import type { InterviewSlotInput, InterviewSlotStage } from '@/lib/interview-slots';

export const GROUP_FIRST_ROUND_TEAMS = ['Strategy', 'Events', 'Design'] as const;

/** Max candidates in one group interview (manual schedule + auto-gen). */
export const MAX_INTERVIEW_GROUP_SIZE = 12;
export const MIN_INTERVIEW_GROUP_SIZE = 2;

export interface InterviewScheduleConfig {
  firstRoundDate: string | null;
  firstRoundStartTime: string;
  finalRoundDate: string | null;
  finalRoundStartTime: string;
  blockMinutes: number;
  groupSize: number;
  parallelGroupsPerBlock: number;
}

export interface InterviewTimeBlock {
  index: number;
  label: string;
  scheduledAt: string;
}

const DEFAULT_CONFIG: InterviewScheduleConfig = {
  firstRoundDate: null,
  firstRoundStartTime: '09:00',
  finalRoundDate: null,
  finalRoundStartTime: '09:00',
  blockMinutes: 30,
  groupSize: 4,
  parallelGroupsPerBlock: 2,
};

export function firstRoundInterviewFormat(teamName: string): 'group' | 'individual' {
  return (GROUP_FIRST_ROUND_TEAMS as readonly string[]).includes(teamName)
    ? 'group'
    : 'individual';
}

export function interviewFormatForTeam(
  teamName: string,
  stage: InterviewSlotStage,
): 'group' | 'individual' {
  if (stage === 'final_round') return 'individual';
  return firstRoundInterviewFormat(teamName);
}

export async function getInterviewScheduleConfig(): Promise<InterviewScheduleConfig> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM interview_schedule_config WHERE id = 1',
  });
  const row = result.rows[0];
  if (!row) return { ...DEFAULT_CONFIG };

  return {
    firstRoundDate: (row.first_round_date as string | null) ?? null,
    firstRoundStartTime: (row.first_round_start_time as string) ?? '09:00',
    finalRoundDate: (row.final_round_date as string | null) ?? null,
    finalRoundStartTime: (row.final_round_start_time as string) ?? '09:00',
    blockMinutes: (row.block_minutes as number) ?? 30,
    groupSize: (row.group_size as number) ?? 4,
    parallelGroupsPerBlock: (row.parallel_groups_per_block as number) ?? 2,
  };
}

export async function saveInterviewScheduleConfig(
  input: Partial<InterviewScheduleConfig>,
): Promise<InterviewScheduleConfig> {
  const current = await getInterviewScheduleConfig();
  const next: InterviewScheduleConfig = {
    firstRoundDate:
      input.firstRoundDate !== undefined ? input.firstRoundDate : current.firstRoundDate,
    firstRoundStartTime: input.firstRoundStartTime ?? current.firstRoundStartTime,
    finalRoundDate:
      input.finalRoundDate !== undefined ? input.finalRoundDate : current.finalRoundDate,
    finalRoundStartTime: input.finalRoundStartTime ?? current.finalRoundStartTime,
    blockMinutes: input.blockMinutes ?? current.blockMinutes,
    groupSize: input.groupSize ?? current.groupSize,
    parallelGroupsPerBlock:
      input.parallelGroupsPerBlock ?? current.parallelGroupsPerBlock,
  };

  if (next.blockMinutes < 15 || next.blockMinutes > 120) {
    throw new Error('Block length must be between 15 and 120 minutes.');
  }
  if (next.groupSize < MIN_INTERVIEW_GROUP_SIZE || next.groupSize > MAX_INTERVIEW_GROUP_SIZE) {
    throw new Error(
      `Group size must be between ${MIN_INTERVIEW_GROUP_SIZE} and ${MAX_INTERVIEW_GROUP_SIZE}.`,
    );
  }
  if (next.parallelGroupsPerBlock < 1 || next.parallelGroupsPerBlock > 8) {
    throw new Error('Parallel groups per block must be between 1 and 8.');
  }

  const db = getDb();
  await db.execute({
    sql: `INSERT INTO interview_schedule_config (
            id, first_round_date, first_round_start_time,
            final_round_date, final_round_start_time, block_minutes, group_size,
            parallel_groups_per_block
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            first_round_date = excluded.first_round_date,
            first_round_start_time = excluded.first_round_start_time,
            final_round_date = excluded.final_round_date,
            final_round_start_time = excluded.final_round_start_time,
            block_minutes = excluded.block_minutes,
            group_size = excluded.group_size,
            parallel_groups_per_block = excluded.parallel_groups_per_block`,
    args: [
      next.firstRoundDate,
      next.firstRoundStartTime,
      next.finalRoundDate,
      next.finalRoundStartTime,
      next.blockMinutes,
      next.groupSize,
      next.parallelGroupsPerBlock,
    ],
  });

  return next;
}

const TEAM_DAY_DEFAULTS = {
  firstRoundDate: null as string | null,
  firstRoundStartTime: '09:00',
  finalRoundDate: null as string | null,
  finalRoundStartTime: '09:00',
  blockMinutes: 30,
};

export type TeamInterviewDaySettings = typeof TEAM_DAY_DEFAULTS;

export async function getTeamInterviewDaySettings(
  teamId: number,
): Promise<TeamInterviewDaySettings> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM team_interview_schedule_config WHERE team_id = ?',
    args: [teamId],
  });
  const row = result.rows[0];
  if (!row) return { ...TEAM_DAY_DEFAULTS };

  return {
    firstRoundDate: (row.first_round_date as string | null) ?? null,
    firstRoundStartTime: (row.first_round_start_time as string) ?? '09:00',
    finalRoundDate: (row.final_round_date as string | null) ?? null,
    finalRoundStartTime: (row.final_round_start_time as string) ?? '09:00',
    blockMinutes: (row.block_minutes as number) ?? 30,
  };
}

export async function getEffectiveInterviewScheduleConfig(
  teamId: number,
): Promise<InterviewScheduleConfig> {
  const [global, team] = await Promise.all([
    getInterviewScheduleConfig(),
    getTeamInterviewDaySettings(teamId),
  ]);
  return {
    ...global,
    ...team,
  };
}

export async function saveTeamInterviewDaySettings(
  teamId: number,
  stage: InterviewSlotStage,
  input: {
    interviewDate?: string | null;
    startTime?: string;
    blockMinutes?: number;
  },
): Promise<InterviewScheduleConfig> {
  const team = await getTeamInterviewDaySettings(teamId);
  const nextTeam = { ...team };

  if (stage === 'first_round') {
    if (input.interviewDate !== undefined) nextTeam.firstRoundDate = input.interviewDate;
    if (input.startTime !== undefined) nextTeam.firstRoundStartTime = input.startTime;
  } else {
    if (input.interviewDate !== undefined) nextTeam.finalRoundDate = input.interviewDate;
    if (input.startTime !== undefined) nextTeam.finalRoundStartTime = input.startTime;
  }
  if (input.blockMinutes !== undefined) nextTeam.blockMinutes = input.blockMinutes;

  if (nextTeam.blockMinutes < 15 || nextTeam.blockMinutes > 120) {
    throw new Error('Block length must be between 15 and 120 minutes.');
  }

  const db = getDb();
  await db.execute({
    sql: `INSERT INTO team_interview_schedule_config (
            team_id, first_round_date, first_round_start_time,
            final_round_date, final_round_start_time, block_minutes
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(team_id) DO UPDATE SET
            first_round_date = excluded.first_round_date,
            first_round_start_time = excluded.first_round_start_time,
            final_round_date = excluded.final_round_date,
            final_round_start_time = excluded.final_round_start_time,
            block_minutes = excluded.block_minutes`,
    args: [
      teamId,
      nextTeam.firstRoundDate,
      nextTeam.firstRoundStartTime,
      nextTeam.finalRoundDate,
      nextTeam.finalRoundStartTime,
      nextTeam.blockMinutes,
    ],
  });

  return getEffectiveInterviewScheduleConfig(teamId);
}

function stageDateAndStart(
  config: InterviewScheduleConfig,
  stage: InterviewSlotStage,
): { date: string | null; startTime: string } {
  if (stage === 'first_round') {
    return { date: config.firstRoundDate, startTime: config.firstRoundStartTime };
  }
  return { date: config.finalRoundDate, startTime: config.finalRoundStartTime };
}

export function formatBlockTimeRange(blockStart: Date, blockMinutes: number): string {
  const blockEnd = new Date(blockStart.getTime() + blockMinutes * 60_000);

  const fmt = (d: Date) => {
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes();
    const period = d.getHours() >= 12 ? 'PM' : 'AM';
    const text = m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`;
    return { text, period };
  };

  const start = fmt(blockStart);
  const end = fmt(blockEnd);

  if (start.period === end.period) {
    return `${start.text}–${end.text} ${end.period}`;
  }
  return `${start.text} ${start.period}–${end.text} ${end.period}`;
}

export function listTimeBlocks(
  date: string,
  startTime: string,
  blockMinutes: number,
  count: number,
): InterviewTimeBlock[] {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const blockStart = new Date(start.getTime() + index * blockMinutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const scheduledAt = `${date}T${pad(blockStart.getHours())}:${pad(blockStart.getMinutes())}`;
    return {
      index: index + 1,
      label: formatBlockTimeRange(blockStart, blockMinutes),
      scheduledAt,
    };
  });
}

/** Split candidates into group sizes up to maxPerGroup (avoids lone 1-person groups when possible). */
export function distributeGroupSizes(candidateCount: number, maxPerGroup: number): number[] {
  if (candidateCount <= 0) return [];
  if (maxPerGroup < 2) return Array(candidateCount).fill(1);

  const sizes: number[] = [];
  let remaining = candidateCount;
  while (remaining > 0) {
    sizes.push(Math.min(maxPerGroup, remaining));
    remaining -= sizes[sizes.length - 1]!;
  }
  if (sizes.length > 1 && sizes[sizes.length - 1] === 1) {
    sizes[sizes.length - 2]! -= 1;
    sizes[sizes.length - 1]! += 1;
  }
  return sizes;
}

export function blocksForStage(
  config: InterviewScheduleConfig,
  stage: InterviewSlotStage,
  candidateCount: number,
  format: 'group' | 'individual',
): InterviewTimeBlock[] {
  const { date, startTime } = stageDateAndStart(config, stage);
  if (!date || candidateCount === 0) return [];

  const sequentialNeeded =
    format === 'group'
      ? distributeGroupSizes(candidateCount, config.groupSize).length
      : candidateCount;
  const hoursOfBlocks = Math.floor((8 * 60) / config.blockMinutes);
  const blockCount = Math.max(sequentialNeeded, hoursOfBlocks);
  return listTimeBlocks(date, startTime, config.blockMinutes, blockCount);
}

export function autoAssignInterviewSlots(
  candidates: Array<{ applicationId: number }>,
  config: InterviewScheduleConfig,
  stage: InterviewSlotStage,
  format: 'group' | 'individual',
): InterviewSlotInput[] {
  const { date } = stageDateAndStart(config, stage);
  if (!date) {
    throw new Error('Set the interview date on this team\'s schedule first.');
  }

  const blocks = blocksForStage(config, stage, candidates.length, format);
  const slots: InterviewSlotInput[] = [];

  if (format === 'individual') {
    for (let i = 0; i < candidates.length; i++) {
      const block = blocks[i] ?? blocks[blocks.length - 1];
      slots.push({
        applicationId: candidates[i].applicationId,
        scheduledAt: block.scheduledAt,
        location: '',
        logisticsNote: '',
        interviewerIds: [],
      });
    }
    return slots;
  }

  const groupSizes = distributeGroupSizes(candidates.length, config.groupSize);
  let candidateIndex = 0;

  for (let g = 0; g < groupSizes.length; g++) {
    const block = blocks[g] ?? blocks[blocks.length - 1]!;
    const size = groupSizes[g]!;
    const groupKey = `g-${g + 1}`;
    const chunk = candidates.slice(candidateIndex, candidateIndex + size);
    candidateIndex += size;
    for (const candidate of chunk) {
      slots.push({
        applicationId: candidate.applicationId,
        scheduledAt: block.scheduledAt,
        location: '',
        groupKey,
        logisticsNote: '',
        interviewerIds: [],
      });
    }
  }

  return slots;
}

export function defaultGroupKeysForCandidates(
  candidateCount: number,
  maxGroupSize: number,
): string[] {
  const sizes = distributeGroupSizes(candidateCount, maxGroupSize);
  const keys: string[] = [];
  for (let g = 0; g < sizes.length; g++) {
    const key = `g-${g + 1}`;
    for (let i = 0; i < sizes[g]!; i++) {
      keys.push(key);
    }
  }
  return keys;
}

export function isAutoGeneratedLogisticsNote(note: string): boolean {
  return /^Group \d+ at /.test(note.trim());
}

export function mergeCandidateSlotRows(
  candidates: Array<{ applicationId: number; rowIndex: number; candidateName: string }>,
  existingSlots: Array<{
    applicationId: number;
    scheduledAt: string;
    location: string;
    logisticsNote: string;
    groupKey: string;
    interviewerIds: number[];
  }>,
) {
  const slotByApp = new Map(existingSlots.map((s) => [s.applicationId, s]));
  return candidates.map((c) => {
    const existing = slotByApp.get(c.applicationId);
    return {
      applicationId: c.applicationId,
      rowIndex: c.rowIndex,
      candidateName: c.candidateName,
      scheduledAt: existing?.scheduledAt ?? '',
      location: existing?.location ?? '',
      logisticsNote: isAutoGeneratedLogisticsNote(existing?.logisticsNote ?? '')
        ? ''
        : (existing?.logisticsNote ?? ''),
      groupKey: existing?.groupKey ?? '',
      interviewerIds: existing?.interviewerIds ?? [],
    };
  });
}

export function formatLabel(format: 'group' | 'individual'): string {
  return format === 'group' ? 'Group interviews' : 'Individual interviews';
}
