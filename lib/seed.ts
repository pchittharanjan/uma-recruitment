import { getDb, type TeamName } from '@/lib/db';

const TEAMS: TeamName[] = ['Strategy', 'Events', 'Design'];

/** Fixed reference data only. User rows are created at login (Step 3) with real @berkeley.edu emails. */
export async function seedDb(): Promise<void> {
  const db = getDb();

  for (const name of TEAMS) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO teams (name) VALUES (?)',
      args: [name],
    });
  }
}
