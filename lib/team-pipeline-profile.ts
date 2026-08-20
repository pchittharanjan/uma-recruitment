import type { ApplicationStage, TeamName } from '@/lib/db';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASES, nextRoundStatus, phaseLabel, previousRoundStatus, statusIndex } from '@/lib/stages';

export type TeamInterviewStage = 'first_round' | 'final_round';
export type PostFirstRoundStage = 'final_round' | 'deliberations';
export type DeliberationsPoolStage = Extract<
  ApplicationStage,
  'first_round' | 'final_round' | 'deliberations' | 'advanced'
>;

/** Teams that share bulk-advance actions on the admin dashboard. */
export const COHORT_STRATEGY_EVENTS = ['Strategy', 'Events'] as const;

export type TeamPipelineProfile = {
  teamName: TeamName;
  /** Interview stages this team uses */
  interviewStages: TeamInterviewStage[];
  /** After first-round advancement, candidates go here (Design → deliberations) */
  postFirstRoundStage: PostFirstRoundStage;
  /** Stages that feed the deliberations board */
  deliberationsPoolStages: DeliberationsPoolStage[];
  /** Round status after first_round phase ends (Design skips final_round status) */
  skipFinalRoundPhase: boolean;
  /** When advancing past interview, auto-unlock deliberations for this team */
  autoUnlockDeliberations: boolean;
};

const PROFILES: Record<TeamName, TeamPipelineProfile> = {
  Strategy: {
    teamName: 'Strategy',
    interviewStages: ['first_round', 'final_round'],
    postFirstRoundStage: 'final_round',
    deliberationsPoolStages: ['final_round', 'deliberations', 'advanced'],
    skipFinalRoundPhase: false,
    autoUnlockDeliberations: false,
  },
  Events: {
    teamName: 'Events',
    interviewStages: ['first_round', 'final_round'],
    postFirstRoundStage: 'final_round',
    deliberationsPoolStages: ['final_round', 'deliberations', 'advanced'],
    skipFinalRoundPhase: false,
    autoUnlockDeliberations: false,
  },
  Design: {
    teamName: 'Design',
    interviewStages: ['first_round'],
    postFirstRoundStage: 'deliberations',
    deliberationsPoolStages: ['first_round', 'deliberations', 'advanced'],
    skipFinalRoundPhase: true,
    autoUnlockDeliberations: true,
  },
};

export function getTeamPipelineProfile(teamName: string): TeamPipelineProfile {
  if (teamName in PROFILES) {
    return PROFILES[teamName as TeamName];
  }
  return PROFILES.Strategy;
}

export function isKnownTeamName(name: string): name is TeamName {
  return name in PROFILES;
}

/** Pipeline phases visible in nav for this team (Design hides Final Round). */
export function pipelinePhasesForTeam(teamName: string) {
  const profile = getTeamPipelineProfile(teamName);
  return PIPELINE_PHASES.filter(
    (p) => p.status !== 'closed' && (!profile.skipFinalRoundPhase || p.status !== 'final_round'),
  );
}

/** Display label for a pipeline phase — Design uses "Interview" for first_round. */
export function phaseLabelForTeam(status: RoundStatus, teamName: string): string {
  const profile = getTeamPipelineProfile(teamName);
  if (profile.skipFinalRoundPhase && status === 'first_round') {
    return 'Interview';
  }
  return phaseLabel(status);
}

/** Next round status for a team (Design skips final_round). */
export function nextPipelineStatusForTeam(
  current: RoundStatus,
  teamName: string,
): RoundStatus | null {
  const profile = getTeamPipelineProfile(teamName);
  if (profile.skipFinalRoundPhase && current === 'first_round') {
    return 'deliberations';
  }
  return nextRoundStatus(current);
}

/** Previous round status for a team (Design skips final_round). */
export function previousPipelineStatusForTeam(
  current: RoundStatus,
  teamName: string,
): RoundStatus | null {
  const profile = getTeamPipelineProfile(teamName);
  if (profile.skipFinalRoundPhase && current === 'deliberations') {
    return 'first_round';
  }
  const previous = previousRoundStatus(current);
  if (profile.skipFinalRoundPhase && previous === 'final_round') {
    return 'first_round';
  }
  return previous;
}

/** Target application stage after advancing from a given stage. */
export function advancedStageForTeam(
  fromStage: 'application' | 'first_round',
  teamName: string,
): ApplicationStage {
  if (fromStage === 'application') return 'first_round';
  return getTeamPipelineProfile(teamName).postFirstRoundStage;
}

/** Stages to revert from when undoing an advancement decision. */
export function revertSourceStagesForTeam(
  fromStage: 'application' | 'first_round',
  teamName: string,
): ApplicationStage[] {
  if (fromStage === 'application') return ['first_round', 'rejected'];
  const advanced = advancedStageForTeam('first_round', teamName);
  return [advanced, 'rejected'];
}

/** Unlockable stages relevant to this team's pipeline. */
export function unlockableStagesForTeam(teamName: string) {
  return pipelinePhasesForTeam(teamName)
    .map((p) => p.unlockKey)
    .filter((k): k is NonNullable<typeof k> => Boolean(k));
}

export function teamUsesInterviewStage(teamName: string, stage: TeamInterviewStage): boolean {
  return getTeamPipelineProfile(teamName).interviewStages.includes(stage);
}

/** Sort deliberations candidates — Design prioritizes first-round average. */
export function deliberationsSortScore(
  candidate: {
    finalRoundAverage: number | null;
    firstRoundAverage: number | null;
    applicationScore: number | null;
  },
  teamName: string,
): number {
  const profile = getTeamPipelineProfile(teamName);
  if (profile.skipFinalRoundPhase) {
    return candidate.firstRoundAverage ?? candidate.applicationScore ?? -1;
  }
  return candidate.finalRoundAverage ?? candidate.firstRoundAverage ?? candidate.applicationScore ?? -1;
}

/** Stages still on the board before offers are locked (excludes advanced). */
export function deliberationsPendingStages(teamName: string): DeliberationsPoolStage[] {
  return getTeamPipelineProfile(teamName).deliberationsPoolStages.filter(
    (stage) => stage !== 'advanced',
  );
}
