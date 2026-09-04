/**
 * One-off: audit application-stage grader counts per applicant.
 * Usage: node scripts/audit-grader-assignments.mjs
 * Loads TURSO_* from .env.local (does not print secrets).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  const raw = readFileSync(join(root, '.env.local'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const rawUrl = process.env.TURSO_DATABASE_URL;
const rawToken = process.env.TURSO_AUTH_TOKEN;
if (!rawUrl) {
  console.error('TURSO_DATABASE_URL missing from env / .env.local');
  process.exit(1);
}

const url = rawUrl.startsWith('libsql://')
  ? rawUrl.replace('libsql://', 'https://')
  : rawUrl;
const authToken = rawToken?.replace(/^<|>$/g, '');
const db = createClient({ url, authToken });

function bucket(n) {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n === 2) return '2';
  if (n === 3) return '3';
  return '4+';
}

async function main() {
  const teams = await db.execute(
    `SELECT id, name FROM teams ORDER BY name COLLATE NOCASE ASC`,
  );

  for (const team of teams.rows) {
    const teamId = team.id;
    const teamName = team.name;

    // Match getActiveRoundForTeam: prefer non-closed round, else latest closed.
    const roundRes = await db.execute({
      sql: `SELECT r.id, r.label, r.status, rs.graders_per_application
            FROM rounds r
            LEFT JOIN round_settings rs ON rs.round_id = r.id
            WHERE r.team_id = ?
            ORDER BY
              CASE WHEN r.status = 'closed' THEN 1 ELSE 0 END ASC,
              r.id DESC
            LIMIT 1`,
      args: [teamId],
    });
    const round = roundRes.rows[0];
    if (!round) {
      console.log(`\n=== ${teamName} (id=${teamId}) — no round ===`);
      continue;
    }

    const gpa = round.graders_per_application ?? 3;

    const appsRes = await db.execute({
      sql: `SELECT app.id AS application_id,
                   app.row_index,
                   c.name AS candidate_name,
                   COUNT(a.id) AS grader_count,
                   COUNT(DISTINCT a.user_id) AS distinct_graders
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            LEFT JOIN assignments a
              ON a.application_id = app.id AND a.stage = 'application'
            WHERE app.team_id = ? AND app.round_id = ?
            GROUP BY app.id
            ORDER BY grader_count ASC, app.row_index ASC`,
      args: [teamId, round.id],
    });

    const dist = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 };
    const bad = [];
    let totalAssignments = 0;
    let dupUserApps = 0;

    for (const row of appsRes.rows) {
      const gc = Number(row.grader_count);
      const dg = Number(row.distinct_graders);
      totalAssignments += gc;
      dist[bucket(gc)] += 1;
      if (gc !== dg) dupUserApps += 1;
      if (gc !== Number(gpa)) {
        bad.push({
          applicationId: row.application_id,
          rowIndex: row.row_index,
          name: row.candidate_name,
          graderCount: gc,
          distinctGraders: dg,
        });
      }
    }

    const graderLoads = await db.execute({
      sql: `SELECT u.id, u.name, COUNT(a.id) AS total,
                   SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) AS pending
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            JOIN users u ON u.id = a.user_id
            WHERE app.team_id = ? AND app.round_id = ? AND a.stage = 'application'
            GROUP BY u.id
            ORDER BY u.name COLLATE NOCASE ASC`,
      args: [teamId, round.id],
    });

    console.log(`\n=== ${teamName} (team_id=${teamId}) ===`);
    console.log(
      `round=${round.id} (${round.label}, ${round.status}) graders_per_application=${gpa}`,
    );
    console.log(`applications=${appsRes.rows.length} total_assignments=${totalAssignments}`);
    console.log(
      `expected_if_${gpa}_each=${appsRes.rows.length * Number(gpa)}`,
    );
    console.log('distribution (apps by grader count):', dist);
    console.log(`apps_with_duplicate_grader_user=${dupUserApps}`);
    console.log(`graders_with_assignments=${graderLoads.rows.length}`);
    for (const g of graderLoads.rows) {
      console.log(`  - ${g.name}: ${g.total} assignments (${g.pending} pending)`);
    }
    if (bad.length === 0) {
      console.log(`OK: every applicant has exactly ${gpa} graders.`);
    } else {
      console.log(`BAD: ${bad.length} applicants do not have exactly ${gpa} graders:`);
      for (const b of bad.slice(0, 40)) {
        console.log(
          `  app#${b.rowIndex} id=${b.applicationId} "${b.name}": ${b.graderCount} (distinct ${b.distinctGraders})`,
        );
      }
      if (bad.length > 40) console.log(`  ... and ${bad.length - 40} more`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
