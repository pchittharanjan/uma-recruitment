import type { AdvancementVerdict } from '@/lib/advancement-verdict-types';
import { getTeamPipelineProfile } from '@/lib/team-pipeline-profile';

export type AdvancementSubmissionStatus = 'submitted' | 'approved' | 'withdrawn';
export type AdvancementFromStage = 'application' | 'first_round';

export type { AdvancementVerdict };

export interface AdvancementCandidate {
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  /** Leniency-adjusted mean (application stage) or interview mean. */
  average: number;
  /** Unadjusted mean; only set for application-stage rankings. */
  rawAverage?: number;
  rank: number;
}

export interface AdvancementSubmission {
  id: number;
  roundId: number;
  teamId: number;
  fromStage: AdvancementFromStage;
  topN: number;
  candidates: AdvancementCandidate[];
  status: AdvancementSubmissionStatus;
  submittedBy: { id: number; name: string; email: string };
  submittedAt: number;
  reviewedBy: { id: number; name: string; email: string } | null;
  reviewedAt: number | null;
}

export interface AdvancementCandidateBlind {
  applicationId: number;
  rowIndex: number;
  displayId: string;
  average: number;
  rawAverage?: number;
  rank: number;
}

export interface AdvancementSubmissionBlind {
  id: number;
  roundId: number;
  teamId: number;
  fromStage: AdvancementFromStage;
  topN: number;
  candidates: AdvancementCandidateBlind[];
  status: AdvancementSubmissionStatus;
  submittedBy: { id: number; name: string; email: string };
  submittedAt: number;
  reviewedBy: { id: number; name: string; email: string } | null;
  reviewedAt: number | null;
}

export type GradingEditLockReason = 'submitted' | 'approved' | 'pipeline_closed';

export interface GradingEditLock {
  locked: boolean;
  reason: GradingEditLockReason | null;
  message: string;
}

export function advancementFromStageLabel(
  fromStage: AdvancementFromStage,
  teamName?: string,
): string {
  if (fromStage === 'application') {
    return teamName && getTeamPipelineProfile(teamName).skipFinalRoundPhase
      ? 'Application → Interview'
      : 'Application → First Round';
  }
  if (teamName && getTeamPipelineProfile(teamName).skipFinalRoundPhase) {
    return 'Interview → Deliberations';
  }
  return 'First Round → Final Round';
}

export interface AdvancementPanelVerdict {
  name: string;
  verdict: AdvancementVerdict | null;
}

export interface AdvancementPanelNote {
  interviewerName: string;
  comment: string | null;
}

export interface AdvancementGroupMember {
  applicationId: number;
  candidateName: string;
}

export interface AdvancementApplicationContext {
  iGraded: boolean;
  myVerdict: AdvancementVerdict | null;
  panelVerdicts: AdvancementPanelVerdict[];
}

export interface AdvancementInterviewContext {
  iInterviewed: boolean;
  myVerdict: AdvancementVerdict | null;
  panelVerdicts: AdvancementPanelVerdict[];
  myNotes: string | null;
  panelNotes: AdvancementPanelNote[];
  groupLabel: string | null;
  groupMembers: AdvancementGroupMember[];
  scheduledAt: string | null;
  location: string | null;
  groupKey: string | null;
  sessionKey: string;
}
