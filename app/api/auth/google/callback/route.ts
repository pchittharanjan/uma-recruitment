export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  AuthError,
  postLoginPath,
  resolveLoginUser,
  setSessionCookie,
} from '@/lib/auth';
import { initDb } from '@/lib/db';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getGoogleRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
  isGoogleOAuthConfigured,
} from '@/lib/google-oauth';

function loginRedirect(req: NextRequest, path: string, error?: string) {
  const url = new URL(path, req.url);
  if (error) url.searchParams.set('error', error);
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  return res;
}

function mapAuthError(message: string): string {
  if (message.includes('@berkeley.edu')) return 'not_berkeley';
  if (message.includes("don't have access")) return 'no_access';
  if (message.includes('cannot sign in')) return 'invalid_role';
  return 'oauth_failed';
}

/** Google OAuth callback — verify identity, map to `users`, set session cookie. */
export async function GET(req: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return loginRedirect(req, '/login', 'google_not_configured');
  }

  const url = req.nextUrl;
  const oauthError = url.searchParams.get('error');
  if (oauthError === 'access_denied') {
    return loginRedirect(req, '/login', 'access_denied');
  }
  if (oauthError) {
    return loginRedirect(req, '/login', 'oauth_failed');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginRedirect(req, '/login', 'oauth_failed');
  }

  try {
    await initDb();

    const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();
    const redirectUri = getGoogleRedirectUri(req);

    const { accessToken } = await exchangeGoogleCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const profile = await fetchGoogleUserInfo(accessToken);
    if (!profile.emailVerified) {
      return loginRedirect(req, '/login', 'email_unverified');
    }

    const user = await resolveLoginUser(profile.email);
    const res = loginRedirect(req, postLoginPath(user.role));
    setSessionCookie(res, user.id);
    return res;
  } catch (e) {
    if (e instanceof AuthError) {
      return loginRedirect(req, '/login', mapAuthError(e.message));
    }
    console.error('[google oauth callback]', e);
    return loginRedirect(req, '/login', 'oauth_failed');
  }
}
