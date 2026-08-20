import type { RoundStatus } from '@/lib/db';
import type { UnlockableStage } from '@/lib/stages';

export type TeamNavTeam = {
  id: number;
  name: string;
  round: { id: number; label: string; status: RoundStatus } | null;
  grantedStages: UnlockableStage[] | 'all';
  unlockedStages: UnlockableStage[];
  interviewOnlyStage?: string | null;
  isDirector?: boolean;
};

export type TeamNavSnapshot = {
  status: RoundStatus | null;
  teams: TeamNavTeam[];
  isExec: boolean;
  finalSelectionComplete: boolean;
  pipelineClosed: boolean;
  recruitmentCycleShortLabel?: string;
  recruitmentCycleLabel?: string;
};
