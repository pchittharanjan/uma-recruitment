import type { RoundStatus } from '@/lib/db';
import type { InterviewSlotStage } from '@/lib/interview-slots';
import { isRoundAtOrPastStatus } from '@/lib/stages';

export type AdminViewablePhase = RoundStatus | InterviewSlotStage;

function phaseToRoundStatus(phase: AdminViewablePhase): RoundStatus {
  return phase as RoundStatus;
}

/**
 * True when an admin is browsing a phase the live pipeline has not reached yet.
 * Closed cycles are archive mode, not preview.
 */
export function isAdminPhasePreview(
  liveStatus: RoundStatus,
  viewedPhase: AdminViewablePhase,
): boolean {
  if (liveStatus === 'closed') return false;
  return !isRoundAtOrPastStatus(liveStatus, phaseToRoundStatus(viewedPhase));
}

/** Admin may persist pre-work (guides, schedules, board layout) outside the live phase. */
export function adminCanConfigurePhasePreview(
  liveStatus: RoundStatus,
  viewedPhase: AdminViewablePhase,
): boolean {
  if (liveStatus === 'closed') return false;
  return true;
}

/** Finalize/advance actions stay tied to the real pipeline phase. */
export function adminCanFinalizePhase(
  liveStatus: RoundStatus,
  viewedPhase: AdminViewablePhase,
): boolean {
  if (liveStatus === 'closed') return false;
  return !isAdminPhasePreview(liveStatus, viewedPhase);
}
