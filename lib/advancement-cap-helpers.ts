import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import type { AdvancementCapStage } from '@/lib/team-advancement-caps';
import { FIVE_LEVEL_RATING_PHRASE } from '@/lib/next-step-guidance';
import { getTeamPipelineProfile } from '@/lib/team-pipeline-profile';

/**
 * Official target count when a cap is configured: min(cap, pool).
 * Null if unset. When the pool is smaller than the cap, directors must select everyone.
 */
export function resolveAdvancementCapMax(
  cap: number | null,
  totalRanked: number,
): number | null {
  if (cap === null) return null;
  return Math.min(cap, totalRanked);
}

/** Alias: official target, or the full pool when no cap is set. */
export function resolveRequiredAdvancementCount(
  cap: number | null,
  totalRanked: number,
): number {
  return resolveAdvancementCapMax(cap, totalRanked) ?? totalRanked;
}

/**
 * Minimum selections required to submit.
 *
 * Rules:
 * - Cap set: at least min(N, pool) — even when overCapExtra > 0.
 * - Cap unset: not configured (null), unless allowUncapped (Design interview → delibs).
 */
export function resolveAdvancementSelectionMin(options: {
  cap: number | null;
  totalRanked: number;
  overCapExtra?: number;
  allowUncapped?: boolean;
}): number | null {
  const { cap, totalRanked, allowUncapped = false } = options;
  if (cap === null) {
    if (allowUncapped && totalRanked > 0) return 1;
    return null;
  }
  return resolveAdvancementCapMax(cap, totalRanked);
}

/**
 * Effective max the director may select right now.
 *
 * Rules:
 * - Cap + extra: min(pool, officialCap + overCapExtra).
 * - If a pending submission already exceeds that (e.g. after a lowered cap),
 *   they may keep up to that prior count (not add more).
 * - Cap unset + allowUncapped: full pool.
 */
export function resolveAdvancementSelectionMax(options: {
  cap: number | null;
  totalRanked: number;
  overCapExtra?: number;
  previousSubmittedCount?: number | null;
  allowUncapped?: boolean;
}): number | null {
  const {
    cap,
    totalRanked,
    overCapExtra = 0,
    previousSubmittedCount,
    allowUncapped = false,
  } = options;
  if (cap === null) {
    if (allowUncapped) return totalRanked;
    return null;
  }

  const extra = Math.max(0, Math.floor(overCapExtra));
  const effectiveMax = Math.min(totalRanked, cap + extra);

  if (
    previousSubmittedCount != null &&
    previousSubmittedCount > effectiveMax &&
    previousSubmittedCount <= totalRanked
  ) {
    return previousSubmittedCount;
  }
  return effectiveMax;
}

/** True when this team skips Final Round and may advance interview → delibs without a firstRoundCap. */
export function teamAllowsUncappedFirstRoundAdvancement(teamName: string): boolean {
  return getTeamPipelineProfile(teamName).skipFinalRoundPhase;
}

function advancementTargetLabel(fromStage: AdvancementCapStage, teamName?: string): string {
  const skipFinal = Boolean(teamName && getTeamPipelineProfile(teamName).skipFinalRoundPhase);
  switch (fromStage) {
    case 'application':
      return skipFinal ? 'Interview' : 'First Round Interview';
    case 'first_round':
      return skipFinal ? 'Deliberations' : 'Final Round Interview';
    case 'deliberations':
      return 'Final Selection';
  }
}

function advancementWorkersLabel(fromStage: AdvancementCapStage): string {
  switch (fromStage) {
    case 'application':
      return 'Exec';
    case 'first_round':
      return 'Interviewers';
    case 'deliberations':
      return 'Directors';
  }
}

export function advancementPageDescription(
  fromStage: AdvancementFromStage | AdvancementCapStage,
  totalApplications: number,
  cap: number | null,
  overCapExtra = 0,
  teamName?: string,
): string {
  const officialMax = resolveAdvancementCapMax(cap, totalApplications);
  const target = advancementTargetLabel(fromStage, teamName);
  const workers = advancementWorkersLabel(fromStage);
  const extra = Math.max(0, Math.floor(overCapExtra));

  // Design has no First Round → Final Round limit; interview → delibs is uncapped.
  if (
    cap === null &&
    fromStage === 'first_round' &&
    teamName &&
    getTeamPipelineProfile(teamName).skipFinalRoundPhase
  ) {
    return `Design has one interview round. Directors select who moves from Interview into Deliberations (no separate Final Round limit). ${workers} set ${FIVE_LEVEL_RATING_PHRASE} first. Final offer counts use the Deliberations limit.`;
  }

  if (cap === null) {
    return `Your team's advancement limit has not been set yet. An admin must configure it before Directors can submit. ${workers} can still set ${FIVE_LEVEL_RATING_PHRASE} on their assignments.`;
  }

  if (extra > 0) {
    const atLeast = officialMax ?? totalApplications;
    const atMost = Math.min(totalApplications, cap + extra);
    return `Your team's limit is ${cap} (+${extra} extra). Directors must select at least ${atLeast} applicant${atLeast === 1 ? '' : 's'} to ${target} (and may select up to ${atMost}). ${workers} set ${FIVE_LEVEL_RATING_PHRASE} first.`;
  }

  if (officialMax !== null && officialMax < cap) {
    return `Your team has ${totalApplications} applicant${totalApplications === 1 ? '' : 's'} this round. Directors must select all ${officialMax} to ${target} (your team's limit is ${cap}). ${workers} set ${FIVE_LEVEL_RATING_PHRASE} first.`;
  }

  return `Directors select exactly ${cap} applicant${cap === 1 ? '' : 's'} to submit for ${target} (your team's limit). ${workers} set ${FIVE_LEVEL_RATING_PHRASE} on their assignments.`;
}
