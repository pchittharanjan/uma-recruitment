import 'server-only';

import { getDb } from '@/lib/db';
import {
  formatRecruitmentCycleLabel,
  formatRecruitmentCycleShort,
  inferRecruitmentCycleFromDate,
  isValidRecruitmentCycleYear,
  parseRecruitmentSemester,
  validateRecruitmentCycle,
  type OrgRecruitmentCycle,
} from '@/lib/org-recruitment-cycle';

export async function getOrgRecruitmentCycle(): Promise<OrgRecruitmentCycle> {
  const db = getDb();
  const result = await db.execute('SELECT semester, year FROM org_recruitment_cycle WHERE id = 1');
  const row = result.rows[0];
  const semester = parseRecruitmentSemester(row?.semester);
  const year = row?.year != null ? Number(row.year) : NaN;

  if (semester && isValidRecruitmentCycleYear(year)) {
    return { semester, year };
  }

  return inferRecruitmentCycleFromDate();
}

export async function getRecruitmentCycleLabel(): Promise<string> {
  const cycle = await getOrgRecruitmentCycle();
  return formatRecruitmentCycleLabel(cycle.semester, cycle.year);
}

export async function getRecruitmentCycleShortLabel(): Promise<string> {
  const cycle = await getOrgRecruitmentCycle();
  return formatRecruitmentCycleShort(cycle.semester, cycle.year);
}

/** Persist org cycle and sync short label onto every non-closed round. */
export async function saveOrgRecruitmentCycle(
  cycle: OrgRecruitmentCycle,
): Promise<OrgRecruitmentCycle> {
  validateRecruitmentCycle(cycle);

  const db = getDb();
  const shortLabel = formatRecruitmentCycleShort(cycle.semester, cycle.year);

  await db.execute({
    sql: `INSERT INTO org_recruitment_cycle (id, semester, year)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            semester = excluded.semester,
            year = excluded.year`,
    args: [cycle.semester, cycle.year],
  });

  await db.execute({
    sql: `UPDATE rounds SET label = ? WHERE status != 'closed'`,
    args: [shortLabel],
  });

  return cycle;
}
