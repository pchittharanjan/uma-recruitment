import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getUserById, type User, type UserRole } from '@/lib/db';

export const IMPERSONATE_AS_COOKIE = 'uma_impersonate_as';

/** @deprecated Replaced by IMPERSONATE_AS_COOKIE — cleared on read/write for migration. */
export const IMPERSONATOR_COOKIE = 'uma_impersonator_id';

export const IMPERSONATABLE_ROLES: UserRole[] = ['exec', 'ad_hoc_exec'];

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function parseUserId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function canImpersonateUser(user: User): boolean {
  return IMPERSONATABLE_ROLES.includes(user.role);
}

export async function getImpersonateTargetFromRequest(req: NextRequest): Promise<User | null> {
  const id = parseUserId(req.cookies.get(IMPERSONATE_AS_COOKIE)?.value);
  if (!id) return null;
  const user = await getUserById(id);
  return user && canImpersonateUser(user) ? user : null;
}

/** Deduped per RSC request so portal layout + team context share one lookup. */
export const getImpersonateTarget = cache(async function getImpersonateTarget(): Promise<User | null> {
  const cookieStore = await cookies();
  const id = parseUserId(cookieStore.get(IMPERSONATE_AS_COOKIE)?.value);
  if (!id) return null;
  const user = await getUserById(id);
  return user && canImpersonateUser(user) ? user : null;
});

export function isImpersonatingRequest(req: NextRequest): boolean {
  return Boolean(
    parseUserId(req.cookies.get(IMPERSONATE_AS_COOKIE)?.value) ||
      parseUserId(req.cookies.get(IMPERSONATOR_COOKIE)?.value),
  );
}

export function setImpersonateAsCookie(res: NextResponse, targetUserId: number): void {
  res.cookies.set(IMPERSONATE_AS_COOKIE, String(targetUserId), {
    ...cookieBase,
    maxAge: 60 * 60 * 4,
  });
  res.cookies.set(IMPERSONATOR_COOKIE, '', { ...cookieBase, maxAge: 0 });
}

export function clearImpersonationCookies(res: NextResponse): void {
  res.cookies.set(IMPERSONATE_AS_COOKIE, '', { ...cookieBase, maxAge: 0 });
  res.cookies.set(IMPERSONATOR_COOKIE, '', { ...cookieBase, maxAge: 0 });
}

/**
 * Effective exec/ad hoc user for the team portal — real exec session, or admin test mode.
 * Returns null when unauthenticated or not allowed.
 */
export async function requireTeamPortalUser(
  req: NextRequest,
  options?: { roles?: UserRole[] },
): Promise<User | null> {
  const sessionUser = await getSessionUserFromRequest(req);
  if (!sessionUser) return null;

  const impersonateTarget = await getImpersonateTargetFromRequest(req);

  if (impersonateTarget) {
    if (sessionUser.role !== 'admin') return null;
    if (options?.roles && !options.roles.includes(impersonateTarget.role)) return null;
    return impersonateTarget;
  }

  if (sessionUser.role !== 'exec' && sessionUser.role !== 'ad_hoc_exec') return null;
  if (options?.roles && !options.roles.includes(sessionUser.role)) return null;
  return sessionUser;
}
