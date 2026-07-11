import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1 || line.trimStart().startsWith('#')) continue;
  const key = line.slice(0, idx).trim();
  let val = line.slice(idx + 1).trim();
  if (val.startsWith('<') && val.endsWith('>')) val = val.slice(1, -1);
  process.env[key] = val;
}

import { getDb, getUserByEmail, initDb } from '../lib/db';

const email = 'pranav8@berkeley.edu';

await initDb();

const existing = await getUserByEmail(email);
if (existing) {
  console.log(`Already on the list: ${existing.email} (${existing.role})`);
  process.exit(0);
}

const db = getDb();
await db.execute({
  sql: `INSERT INTO users (email, name, role) VALUES (?, ?, 'admin')`,
  args: [email, 'Pranav'],
});

const user = await getUserByEmail(email);
console.log(`Added: ${user?.email} as ${user?.role}`);
