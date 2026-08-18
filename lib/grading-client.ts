'use client';

import type { GradingEditLock } from '@/lib/advancement-submissions-types';

export interface GradeAppData {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingComment: string;
  graderProgress: { total: number; completed: number };
  scoreFields: string[];
  portfolioFields?: Record<string, string>;
  contextFields: string[];
  customScoreFields: string[];
  graderInstructions: string | null;
  gradingEditLock: GradingEditLock;
  isDirector?: boolean;
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
  return `${teamId}:${applicationId}`;
}

export function loadGradeData(
  teamId: string,
  applicationId: string | number,
): Promise<GradeAppData> {
  const key = cacheKey(teamId, applicationId);
  const hit = gradeDataCache.get(key);
  if (hit) return hit;

  const promise = fetch(`/api/team/grading/${applicationId}?teamId=${teamId}`)
    .then(async (r) => {
      const d = await r.json();
      if (d.error) throw new Error(d.error as string);
      return d as GradeAppData;
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

/**
 * Warm the cache for the applicant the grader will most likely see next:
 * the first pending assignment (by row order) other than the current one.
 * Mirrors the next-application choice made by the score submit endpoint.
 */
export async function prefetchNextPendingGradeData(
  teamId: string,
  currentApplicationId: number,
): Promise<void> {
  try {
    const r = await fetch(`/api/team/grading?teamId=${teamId}`);
    const d = await r.json();
    if (d.error) return;
    const assignments = (d.assignments ?? []) as QueueAssignment[];
    const next = assignments
      .filter((a) => a.status === 'pending' && a.applicationId !== currentApplicationId)
      .sort((a, b) => a.rowIndex - b.rowIndex)[0];
    if (next) {
      void loadGradeData(teamId, next.applicationId).catch(() => {});
    }
  } catch {
    // Prefetch is best-effort; the normal fetch path still works without it.
  }
}
