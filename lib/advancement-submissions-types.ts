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

/** Advancement lock freezes scores but still allows note edits. Pipeline close freezes everything. */
export function scoresLockedNotesEditable(lock: GradingEditLock | null | undefined): boolean {
  return Boolean(
    lock?.locked && (lock.reason === 'submitted' || lock.reason === 'approved'),
  );
}

export function interviewNotesLocked(lock: GradingEditLock | null | undefined): boolean {
  return Boolean(lock?.locked && !scoresLockedNotesEditable(lock));
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

export interface AdvancementQuestionNote {
  label: string;
  note: string;
}

export interface AdvancementPanelNote {
  interviewerName: string;
  comment: string | null;
  /** Per-question / per-field notes from the scores table. */
  questionNotes: AdvancementQuestionNote[];
}

/** One grader or interviewer’s notes shown during advancement color selection. */
export interface AdvancementReviewerNotes {
  reviewerName: string;
  comment: string | null;
  questionNotes: AdvancementQuestionNote[];
  average: number | null;
  isMine: boolean;
}

export interface AdvancementGroupMember {
  applicationId: number;
  candidateName: string;
}

export interface AdvancementApplicationContext {
  iGraded: boolean;
  /** Mean of this viewer’s numeric criterion scores; null if they didn’t finish grading. */
  myAverage: number | null;
  myVerdict: AdvancementVerdict | null;
  panelVerdicts: AdvancementPanelVerdict[];
  /** Every grader’s comments + question notes (including the viewer). */
  graderNotes: AdvancementReviewerNotes[];
}

export interface AdvancementInterviewContext {
  iInterviewed: boolean;
  /** Mean of this viewer’s numeric interview scores; null if they didn’t finish scoring. */
  myAverage: number | null;
  myVerdict: AdvancementVerdict | null;
  panelVerdicts: AdvancementPanelVerdict[];
  myNotes: string | null;
  panelNotes: AdvancementPanelNote[];
  /** Every interviewer’s overall + question notes (including the viewer). */
  interviewNotes: AdvancementReviewerNotes[];
  /** Application-stage grader notes for the same candidate (for color selection). */
  applicationNotes: AdvancementReviewerNotes[];
  groupLabel: string | null;
  groupMembers: AdvancementGroupMember[];
  scheduledAt: string | null;
  location: string | null;
  groupKey: string | null;
  sessionKey: string;
}
