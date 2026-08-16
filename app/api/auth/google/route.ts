export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  getGoogleRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
  isGoogleOAuthConfigured,
} from '@/lib/google-oauth';

function loginErrorRedirect(req: NextRequest, code: string) {
  const url = new URL('/login', req.url);
  url.searchParams.set('error', code);
  return NextResponse.redirect(url);
}

/** Start Google OAuth — sets CSRF state cookie and redirects to Google. */
export async function GET(req: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return loginErrorRedirect(req, 'google_not_configured');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const redirectUri = getGoogleRedirectUri(req);
  const state = createOAuthState();

  const authUrl = buildGoogleAuthorizationUrl({
    clientId,
    redirectUri,
    state,
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });
  return res;
}
