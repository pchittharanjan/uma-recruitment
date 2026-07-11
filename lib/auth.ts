import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByEmail,
  getUserById,
  type User,
  type UserRole,
} from '@/lib/db';
import { isExecRole, type LoginRole } from '@/lib/roles';

export type { LoginRole } from '@/lib/roles';

export const SESSION_COOKIE = 'uma_user_id';

export function isBerkeleyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@berkeley.edu');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getSharedTokenForRole(role: LoginRole): string | undefined {
  if (role === 'admin') return process.env.ADMIN_AUTH_TOKEN;
  return process.env.TEAM_EXEC_AUTH_TOKEN;
}

function parseUserId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function getSessionUserFromRequest(req: NextRequest): Promise<User | null> {
  const id = parseUserId(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return getUserById(id);
}

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const id = parseUserId(cookieStore.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return getUserById(id);
}

export async function requireAuth(
  req: NextRequest,
  options?: { roles?: UserRole[] },
): Promise<User | null> {
  const user = await getSessionUserFromRequest(req);
  if (!user) return null;
  if (options?.roles && !options.roles.includes(user.role)) return null;
  return user;
}

export function setSessionCookie(res: NextResponse, userId: number): void {
  res.cookies.set(SESSION_COOKIE, String(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function authenticateLogin(input: LoginInput): Promise<User> {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!isBerkeleyEmail(email)) {
    throw new AuthError('Use your @berkeley.edu email address.');
  }

  const user = await getUserByEmail(email);
  if (!user) {
    throw new AuthError("You don't have access yet. Ask an admin to add your email.");
  }

  if (user.role !== 'admin' && !isExecRole(user.role)) {
    throw new AuthError('This account cannot sign in here.');
  }

  const roleForToken: LoginRole = user.role === 'admin' ? 'admin' : 'exec';
  const expectedToken = getSharedTokenForRole(roleForToken);
  if (!expectedToken) {
    throw new AuthError('Sign-in is not configured. Set the auth tokens in env.');
  }
  if (password !== expectedToken) {
    throw new AuthError('Invalid password.');
  }

  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export function notFound(msg = 'Not found') {
  return NextResponse.json({ error: msg }, { status: 404 });
}
