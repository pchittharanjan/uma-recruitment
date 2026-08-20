import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { getUserById, type User } from '@/lib/db';
import { SESSION_COOKIE, parseUserId } from '@/lib/auth';

/** Deduped per RSC request so nested layouts share one session lookup. */
export const getSessionUser = cache(async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const id = parseUserId(cookieStore.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return getUserById(id);
});
