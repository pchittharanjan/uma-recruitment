'use client';

import type { TeamName } from '@/lib/db';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import type { TeamGradingModel } from '@/lib/grading-model-types';
import {
  FALL_2026_GRADER_INSTRUCTIONS,
  hydrateFall2026ModelFromRound,
  teamUsesApplicationPortfolio,
} from '@/lib/fall-2026-grading-model';
import {
  applicationCriterionKeys,
  getApplicationComponent,
  primaryScoredQuestions,
} from '@/lib/grading-model';

export interface GradeAppData {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingNotes: Record<string, string>;
  existingComment: string;
  graderProgress: { total: number; completed: number };
  scoreFields: string[];
  portfolioFields?: Record<string, string>;
  contextFields: string[];
  customScoreFields: string[];
  graderInstructions: string | null;
  gradingModel: TeamGradingModel | null;
  applicationQuestions: TeamGradingModel['components'][number]['questions'];
  gradingEditLock: GradingEditLock;
  isDirector?: boolean;
  isAdminGrader?: boolean;
  teamName?: TeamName;
  showPortfolioSection?: boolean;
}

/** Ensure Fall 2026 criterion rubrics render even if the round row is missing grading_model. */
export function normalizeGradeAppData(
  data: GradeAppData,
  teamNameOverride?: TeamName,
): GradeAppData {
  const teamName = data.teamName ?? teamNameOverride;
  const showPortfolioSection =
    data.showPortfolioSection ?? (teamName ? teamUsesApplicationPortfolio(teamName) : false);

  const existingNotes = data.existingNotes ?? {};

  if ((data.applicationQuestions?.length ?? 0) > 0) {
    return { ...data, teamName, showPortfolioSection, existingNotes };
  }

  if (!teamName) return { ...data, showPortfolioSection, existingNotes };

  const model = hydrateFall2026ModelFromRound(
    teamName,
    Object.keys(data.fields),
    data.scoreFields,
  );
  const allQuestions = getApplicationComponent(model)?.questions ?? [];
  if (primaryScoredQuestions(allQuestions).length === 0) {
    return { ...data, teamName, showPortfolioSection, existingNotes };
  }

  return {
    ...data,
    teamName,
    showPortfolioSection,
    existingNotes,
    // Full list so linked responses can be resolved onto primary cards.
    applicationQuestions: allQuestions,
    customScoreFields: applicationCriterionKeys(model),
    gradingModel: model,
    graderInstructions: data.graderInstructions ?? FALL_2026_GRADER_INSTRUCTIONS,
  };
}

interface QueueAssignment {
  applicationId: number;
  rowIndex: number;
  status: 'pending' | 'completed';
}

/**
 * Session-lived cache of grading payloads keyed by team+application, so the
 * next applicant renders instantly after submit instead of showing a spinner.
 */
const gradeDataCache = new Map<string, Promise<GradeAppData>>();

function cacheKey(teamId: string, applicationId: string | number): string {
  return `rubric-v3:${teamId}:${applicationId}`;
}

export function loadGradeData(
  teamId: string,
  applicationId: string | number,
  teamName?: TeamName,
): Promise<GradeAppData> {
  const key = cacheKey(teamId, applicationId);
  const hit = gradeDataCache.get(key);
  if (hit) return hit;

  const promise = fetch(`/api/team/grading/${applicationId}?teamId=${teamId}&rubric=v2`)
    .then(async (r) => {
      const d = await r.json();
      if (d.error) throw new Error(d.error as string);
      return normalizeGradeAppData(d as GradeAppData, teamName);
    })
    .catch((err) => {
      gradeDataCache.delete(key); // don't cache failures
      throw err;
    });

  gradeDataCache.set(key, promise);
  return promise;
}

/** Drop a cached applicant (call after submitting so a revisit shows saved state). */
export function invalidateGradeData(teamId: string, applicationId: string | number): void {
  gradeDataCache.delete(cacheKey(teamId, applicationId));
}

/** Drop every cached applicant for a team (e.g. after submit so progress counts refresh). */
export function invalidateTeamGradeData(teamId: string): void {
  const prefix = `rubric-v3:${teamId}:`;
  for (const key of [...gradeDataCache.keys()]) {
    if (key.startsWith(prefix)) gradeDataCache.delete(key);
  }
}

/**
 * First pending assignment (by row order) other than the current one.
 * Mirrors the next-application choice made by the score submit endpoint.
 */
export async function resolveNextPendingApplicationId(
  teamId: string,
  currentApplicationId: number,
): Promise<number | null> {
  const r = await fetch(`/api/team/grading?teamId=${teamId}`);
  const d = await r.json();
  if (d.error) return null;
  const assignments = (d.assignments ?? []) as QueueAssignment[];
  const next = assignments
    .filter((a) => a.status === 'pending' && a.applicationId !== currentApplicationId)
    .sort((a, b) => a.rowIndex - b.rowIndex)[0];
  return next?.applicationId ?? null;
}

/**
 * Warm the cache for the applicant the grader will most likely see next.
 */
export async function prefetchNextPendingGradeData(
  teamId: string,
  currentApplicationId: number,
): Promise<void> {
  try {
    const nextId = await resolveNextPendingApplicationId(teamId, currentApplicationId);
    if (nextId != null) {
      void loadGradeData(teamId, nextId).catch(() => {});
    }
  } catch {
    // Prefetch is best-effort; the normal fetch path still works without it.
  }
}
