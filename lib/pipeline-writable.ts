import 'server-only';

import { NextResponse } from 'next/server';
import { forbidden } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-session';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';
import { getImpersonateTarget } from '@/lib/impersonation';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';

export const PIPELINE_CLOSED_MESSAGE =
  'This recruitment cycle is closed. Viewing is available, but changes are no longer allowed.';

/** True when the org pipeline has reached the closed (archive) status. */
export async function isPipelineClosed(): Promise<boolean> {
  const state = await getGlobalPipelineState();
  return state.status === 'closed';
}

function isAdminActor(user: { role: string } | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Call at the start of mutation handlers. Returns a 403 when the pipeline is
 * closed for non-admin users; admins retain write access (wrap-up emails,
 * corrections, etc.). Pass `user` when already authenticated; otherwise the
 * session is checked. Admin impersonating a team user is treated as that user
 * (view-only when closed).
 */
export async function assertPipelineWritable(
  user?: { role: string } | null,
): Promise<NextResponse | null> {
  if (!(await isPipelineClosed())) return null;

  if (user !== undefined) {
    if (isAdminActor(user)) return null;
    return forbidden(PIPELINE_CLOSED_MESSAGE);
  }

  // Acting as a team member (admin test mode) → view-only when closed.
  if (await getImpersonateTarget()) {
    return forbidden(PIPELINE_CLOSED_MESSAGE);
  }

  const actor = await getSessionUser();
  if (isAdminActor(actor)) return null;

  return forbidden(PIPELINE_CLOSED_MESSAGE);
}

/**
 * Edit-lock payload for team grading/scoring UIs.
 * Admins (not impersonating) keep write access after close.
 */
export async function pipelineClosedEditLock(
  user?: { role: string } | null,
): Promise<GradingEditLock | null> {
  if (!(await isPipelineClosed())) return null;

  if (user !== undefined) {
    if (isAdminActor(user)) return null;
    return {
      locked: true,
      reason: 'pipeline_closed',
      message: PIPELINE_CLOSED_MESSAGE,
    };
  }

  if (await getImpersonateTarget()) {
    return {
      locked: true,
      reason: 'pipeline_closed',
      message: PIPELINE_CLOSED_MESSAGE,
    };
  }

  const actor = await getSessionUser();
  if (isAdminActor(actor)) return null;

  return {
    locked: true,
    reason: 'pipeline_closed',
    message: PIPELINE_CLOSED_MESSAGE,
  };
}
