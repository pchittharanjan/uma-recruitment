import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const IMPERSONATE_AS_COOKIE = 'uma_impersonate_as';

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  if (req.cookies.get(IMPERSONATE_AS_COOKIE)?.value) {
    return NextResponse.redirect(new URL('/team', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
