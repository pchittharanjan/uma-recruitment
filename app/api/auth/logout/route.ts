export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { clearImpersonationCookies } from '@/lib/impersonation';

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  clearImpersonationCookies(res);
  return res;
}
