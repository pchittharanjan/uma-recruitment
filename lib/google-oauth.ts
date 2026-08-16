import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';

export const GOOGLE_OAUTH_STATE_COOKIE = 'uma_oauth_state';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

/** Public app origin for OAuth redirect_uri (no trailing slash). */
export function getAppOrigin(req: NextRequest): string {
  const fromEnv =
    process.env.AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/^https?:\/\//, '')}`;
  }

  return req.nextUrl.origin;
}

export function getGoogleRedirectUri(req: NextRequest): string {
  return `${getAppOrigin(req)}/api/auth/google/callback`;
}

export function createOAuthState(): string {
  return randomBytes(24).toString('hex');
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: input.state,
    // Hint only — still enforce @berkeley.edu server-side after callback.
    hd: 'berkeley.edu',
    prompt: 'select_account',
    access_type: 'online',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  sub?: string;
}

export async function exchangeGoogleCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Google token exchange failed: ${detail}`);
  }

  return { accessToken: data.access_token };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  email: string;
  emailVerified: boolean;
  name: string | null;
}> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Google userinfo failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as GoogleUserInfo;
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!email) {
    throw new Error('Google account did not return an email.');
  }

  const emailVerified =
    data.email_verified === true || data.email_verified === 'true';

  return {
    email,
    emailVerified,
    name: typeof data.name === 'string' ? data.name : null,
  };
}
