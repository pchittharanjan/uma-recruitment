import 'server-only';

import { DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import {
  getTeamInterviewRoundStatsBothStagesBatch,
  getTeamRoundStatsBatch,
  teamRoundStatsMapKey,
  type TeamRoundKey,
} from '@/lib/batch-team-stats';
import { listUserApplicationGradingProgressByTeam } from '@/lib/team-dashboard';
import type { TeamInterviewRoundStats } from '@/lib/interview-slots';
import {
  formatTeamStatusSummary,
  getGlobalPipelineState,
  suggestedDashboardViewPhase,
  type GlobalPipelineState,
} from '@/lib/pipeline-phase';
import { getPhaseChecklistForStatus } from '@/lib/phase-checklist';
import { cachedPerRequest } from '@/lib/request-cache';
import { getTeams, type RoundStatus } from '@/lib/db';
import type { UnlockableStage } from '@/lib/stages';
import { PIPELINE_PHASES } from '@/lib/stages';
import type { PhaseChecklistStep } from '@/lib/phase-checklist';

export type AdminDashboardTeam = {
  id: number;
  name: string;
  round: { id: number; label: string; status: string } | null;
  unlockedStages: UnlockableStage[];
  interviewStatsByStage: {
    first_round: TeamInterviewRoundStats | null;
    final_round: TeamInterviewRoundStats | null;
  };
  applicationCount: number;
  assignmentProgress: { total: number; completed: number };
  gradersPerApplication: number;
  myGrading: { total: number; completed: number } | null;
};

export type AdminDashboardPayload = {
  pipelineStatus: RoundStatus | null;
  teamStatusSummary: string;
  teams: AdminDashboardTeam[];
  applicationCount: number;
  assignmentProgress: { total: number; completed: number };
  gradersPerApplication: number | null;
};

export type AdminPhasePayload = GlobalPipelineState & {
  phases: typeof PIPELINE_PHASES;
  pipelineClosed: boolean;
  checklist?: PhaseChecklistStep[];
};

function teamRoundKeysFromPipeline(
  teams: Awaited<ReturnType<typeof getTeams>>,
  roundByTeam: Map<number, { id: number; label: string; status: string } | null | undefined>,
): TeamRoundKey[] {
  return teams.flatMap((team) => {
    const round = roundByTeam.get(team.id);
    return round ? [{ teamId: team.id, roundId: round.id }] : [];
  });
}

/** Shared batched team stats for admin dashboard and phase checklist. */
export async function loadAdminTeamDashboardStats(
  teams: Awaited<ReturnType<typeof getTeams>>,
  globalState: GlobalPipelineState,
): Promise<AdminDashboardTeam[]> {
  const cacheKey = 'adminTeamDashboardStats';
  return cachedPerRequest(cacheKey, async () => {
    const roundByTeam = new Map(
      globalState.teams.map((t) => [t.teamId, t.round] as const),
    );
    const unlockByTeam = new Map(
      globalState.teams.map((t) => [t.teamId, t.unlockedStages] as const),
    );
    const keys = teamRoundKeysFromPipeline(teams, roundByTeam);

    const [roundStats, interviewStats] = await Promise.all([
      getTeamRoundStatsBatch(keys),
      getTeamInterviewRoundStatsBothStagesBatch(keys),
    ]);

    return teams.map((team) => {
      const round = roundByTeam.get(team.id) ?? null;
      const displayRound = round
        ? { id: round.id, label: round.label, status: round.status }
        : null;

      if (!round) {
        return {
          ...team,
          round: null,
          unlockedStages: unlockByTeam.get(team.id) ?? [],
          interviewStatsByStage: { first_round: null, final_round: null },
          applicationCount: 0,
          assignmentProgress: { total: 0, completed: 0 },
          gradersPerApplication: DEFAULT_GRADERS_PER_APPLICATION,
          myGrading: null,
        };
      }

      const mapKey = teamRoundStatsMapKey(team.id, round.id);
      const stats = roundStats.get(mapKey) ?? {
        applicationCount: 0,
        assignmentProgress: { total: 0, completed: 0 },
        gradersPerApplication: DEFAULT_GRADERS_PER_APPLICATION,
      };
      const interviews = interviewStats.get(mapKey) ?? {
        first_round: {
          candidateCount: 0,
          slotCount: 0,
          scoring: { total: 0, completed: 0 },
        },
        final_round: {
          candidateCount: 0,
          slotCount: 0,
          scoring: { total: 0, completed: 0 },
        },
      };

      return {
        ...team,
        round: displayRound,
        unlockedStages: unlockByTeam.get(team.id) ?? [],
        interviewStatsByStage: interviews,
        ...stats,
        myGrading: null,
      };
    });
  });
}

export async function buildAdminDashboardPayload(
  userId?: number,
): Promise<AdminDashboardPayload> {
  const [teams, globalState] = await Promise.all([getTeams(), getGlobalPipelineState()]);
  const [teamsWithRounds, myProgress] = await Promise.all([
    loadAdminTeamDashboardStats(teams, globalState),
    userId ? listUserApplicationGradingProgressByTeam(userId) : Promise.resolve(null),
  ]);

  const applicationCount = teamsWithRounds.reduce((sum, t) => sum + t.applicationCount, 0);
  const assignmentProgress = teamsWithRounds.reduce(
    (acc, t) => ({
      total: acc.total + t.assignmentProgress.total,
      completed: acc.completed + t.assignmentProgress.completed,
    }),
    { total: 0, completed: 0 },
  );

  const gradersPerApplicationValues = teamsWithRounds
    .filter((t) => t.round)
    .map((t) => t.gradersPerApplication);
  const gradersPerApplication =
    gradersPerApplicationValues.length > 0 ? gradersPerApplicationValues[0] : null;

  const teamsWithMine = myProgress
    ? teamsWithRounds.map((team) => ({
        ...team,
        myGrading: myProgress.get(team.id) ?? null,
      }))
    : teamsWithRounds;

  return {
    pipelineStatus: suggestedDashboardViewPhase(globalState.teams),
    teamStatusSummary: formatTeamStatusSummary(globalState.teams),
    teams: teamsWithMine,
    applicationCount,
    assignmentProgress,
    gradersPerApplication,
  };
}

export function lightPhasePayload(state: GlobalPipelineState): AdminPhasePayload {
  return {
    ...state,
    phases: PIPELINE_PHASES,
    pipelineClosed: state.status === 'closed',
  };
}

export async function buildAdminPhasePayload(options: {
  checklistStatus?: RoundStatus | null;
  includeChecklist?: boolean;
}): Promise<AdminPhasePayload> {
  const state = await getGlobalPipelineState();
  const base = lightPhasePayload(state);

  if (!options.includeChecklist) return base;

  const statusForChecklist = options.checklistStatus ?? state.status ?? 'pre_application';
  // Warm shared batched stats so checklist reuses the same cachedPerRequest payload.
  const teams = await getTeams();
  await loadAdminTeamDashboardStats(teams, state);

  const checklist = await getPhaseChecklistForStatus(statusForChecklist, {
    unlockedStages: state.unlockedStages,
  });

  return { ...base, checklist };
}

export type AdminWorkspacePayload = AdminDashboardPayload & {
  status: GlobalPipelineState['status'];
  nextStatus: GlobalPipelineState['nextStatus'];
  unlockedStages: GlobalPipelineState['unlockedStages'];
  /** Pipeline round/unlock snapshot (distinct from dashboard `teams` with stats). */
  pipelineTeams: GlobalPipelineState['teams'];
  teamsWithoutRound: GlobalPipelineState['teamsWithoutRound'];
  statusDrift: GlobalPipelineState['statusDrift'];
  driftedTeams: GlobalPipelineState['driftedTeams'];
  unlockDrift: GlobalPipelineState['unlockDrift'];
  phases: typeof PIPELINE_PHASES;
  pipelineClosed: boolean;
  checklist?: PhaseChecklistStep[];
};

/** Combined payload when dashboard and phase load together. */
export async function buildAdminWorkspacePayload(options: {
  includeChecklist?: boolean;
  checklistStatus?: RoundStatus | null;
} = {}): Promise<AdminWorkspacePayload> {
  const globalState = await getGlobalPipelineState();
  const [dashboard, phase] = await Promise.all([
    buildAdminDashboardPayload(),
    buildAdminPhasePayload({
      includeChecklist: options.includeChecklist,
      checklistStatus: options.checklistStatus,
    }),
  ]);

  const { teams: pipelineTeams, checklist, ...phaseFields } = phase;

  const payload: AdminWorkspacePayload = {
    ...dashboard,
    ...phaseFields,
    pipelineTeams,
    checklist,
  };
  return payload;
}
