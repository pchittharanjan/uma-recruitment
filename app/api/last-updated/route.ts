import { NextResponse } from 'next/server';
import { resolveLastUpdatedIso } from '@/lib/last-updated-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const lastUpdated = await resolveLastUpdatedIso();
  return NextResponse.json({ lastUpdated });
}
