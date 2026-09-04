export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

/** Member in-app coffee chat list removed — Google Form + admin import only. */
export async function GET() {
  return NextResponse.json(
    { error: 'Coffee chat notes are imported by admins from the Google Form sheet.' },
    { status: 410 },
  );
}
