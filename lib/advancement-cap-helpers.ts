import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import type { AdvancementCapStage } from '@/lib/team-advancement-caps';

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
 * - Normal (cap set, no override): exactly min(N, pool) — min === max from
 *   resolveAdvancementSelectionMax.
 * - Allow-over-cap: still require at least min(N, pool) (or 1 if no cap); directors
 *   may exceed N up to the pool via resolveAdvancementSelectionMax.
 * - Lowered cap below a pending over-cap list: min stays at the official target;
 *   they may keep more (up to previous count) but must not submit fewer than the target.
 */
export function resolveAdvancementSelectionMin(options: {
  cap: number | null;
  totalRanked: number;
  allowOverCap: boolean;
}): number | null {
  const { cap, totalRanked, allowOverCap } = options;
  if (cap === null && !allowOverCap) return null;
  if (cap === null && allowOverCap) return totalRanked > 0 ? 1 : null;
  return resolveAdvancementCapMax(cap, totalRanked);
}

/**
 * Effective max the director may select right now.
 *
 * Rules:
 * - Allow-over-cap: up to the full pool (may exceed official target; min still applies).
 * - Otherwise: official target min(N, pool). If a pending submission already exceeds a
 *   later-lowered cap, they may keep up to that prior count (not add more).
 */
export function resolveAdvancementSelectionMax(options: {
  cap: number | null;
  totalRanked: number;
  allowOverCap: boolean;
  previousSubmittedCount?: number | null;
}): number | null {
  const { cap, totalRanked, allowOverCap, previousSubmittedCount } = options;
  if (cap === null && !allowOverCap) return null;
  if (allowOverCap) return totalRanked;

  const official = resolveAdvancementCapMax(cap, totalRanked);
  if (official === null) return null;

  if (
    previousSubmittedCount != null &&
    previousSubmittedCount > official &&
    previousSubmittedCount <= totalRanked
  ) {
    return previousSubmittedCount;
  }
  return official;
}

function advancementTargetLabel(fromStage: AdvancementCapStage): string {
  switch (fromStage) {
    case 'application':
      return 'First Round Interview';
    case 'first_round':
      return 'Final Round Interview';
    case 'deliberations':
      return 'Final selection';
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
  allowOverCap = false,
): string {
  const officialMax = resolveAdvancementCapMax(cap, totalApplications);
  const target = advancementTargetLabel(fromStage);
  const workers = advancementWorkersLabel(fromStage);

  if (cap === null && !allowOverCap) {
    return `Your team's advancement limit has not been set yet. An admin must configure it before Directors can submit. ${workers} can still set panel recommendations.`;
  }

  if (allowOverCap) {
    const limitNote =
      cap === null
        ? 'An admin has allowed advancement without a fixed limit'
        : `Your team's limit is ${cap}, but an admin has allowed selecting past that limit`;
    if (cap === null) {
      return `${limitNote}. Directors may advance 1 or more applicants to ${target} (up to all ${totalApplications}). ${workers} set panel recommendations first.`;
    }
    const atLeast = officialMax ?? totalApplications;
    return `${limitNote}. Directors must select at least ${atLeast} applicant${atLeast === 1 ? '' : 's'} to ${target} (and may select more, up to all ${totalApplications}). ${workers} set panel recommendations first.`;
  }

  if (cap === null) {
    return `Your team's advancement limit has not been set yet. An admin must configure it before Directors can submit. ${workers} can still set panel recommendations.`;
  }

  if (officialMax !== null && officialMax < cap) {
    return `Your team has ${totalApplications} applicant${totalApplications === 1 ? '' : 's'} this round. Directors must select all ${officialMax} to ${target} (your team's limit is ${cap}). ${workers} set panel recommendations first.`;
  }

  return `Directors select exactly ${cap} applicant${cap === 1 ? '' : 's'} to submit for ${target} (your team's limit). ${workers} set panel recommendations on their assignments.`;
}
