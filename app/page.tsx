export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { initDb } from '@/lib/db';

export default async function RootPage() {
  try {
    await initDb();
  } catch {
    // DB not configured — login will surface the error
  }
  redirect('/login');
}
