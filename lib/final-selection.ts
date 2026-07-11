import 'server-only';

import { findGradeInFields } from '@/lib/candidates';
import { getDb, getTeams, type User } from '@/lib/db';
import { isOrgFinalSelectionComplete } from '@/lib/org-final-selection-status';
import {
  formatRecruitmentCycleShort,
  type OrgRecruitmentCycle,
} from '@/lib/org-recruitment-cycle';
import { getOrgRecruitmentCycle } from '@/lib/org-recruitment-cycle-server';

export interface FinalSelectionMember {
  applicationId: number;
  name: string;
  email: string;
  grade: string;
  teamId: number;
  teamName: string;
}

export interface FinalSelectionPayload {
  complete: boolean;
  cycle: OrgRecruitmentCycle;
  cycleLabel: string;
  members: FinalSelectionMember[];
}

/** Most recent round for a team, including closed. */
export async function getLatestRoundIdForTeam(teamId: number): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id FROM rounds
          WHERE team_id = ?
          ORDER BY created_at DESC
          LIMIT 1`,
    args: [teamId],
  });
  const id = result.rows[0]?.id;
  return id == null ? null : Number(id);
}

/**
 * Org-wide final offers across every team.
 * Final selection is intentionally not team-siloed — anyone with access sees all accepts.
 */
export async function getFinalSelectionByTeam(
  _user: User,
): Promise<FinalSelectionPayload> {
  const cycle = await getOrgRecruitmentCycle();
  const cycleLabel = formatRecruitmentCycleShort(cycle.semester, cycle.year);
  const teams = await getTeams();
  const orgComplete = await isOrgFinalSelectionComplete();
  const db = getDb();

  const members: FinalSelectionMember[] = [];

  for (const team of teams) {
    const roundId = await getLatestRoundIdForTeam(team.id);
    if (roundId == null) continue;

    const result = await db.execute({
      sql: `SELECT app.id, c.name, c.email, app.fields
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'advanced'
            ORDER BY c.name ASC`,
      args: [team.id, roundId],
    });

    for (const row of result.rows) {
      let fields: Record<string, string> = {};
      try {
        const parsed = JSON.parse((row.fields as string) || '{}') as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          fields = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
              key,
              value == null ? '' : String(value),
            ]),
          );
        }
      } catch {
        // ignore malformed fields
      }

      members.push({
        applicationId: Number(row.id),
        name: (row.name as string) || `Applicant ${row.id}`,
        email: (row.email as string) || '',
        grade: findGradeInFields(fields),
        teamId: team.id,
        teamName: team.name,
      });
    }
  }

  members.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.teamName.localeCompare(b.teamName);
  });

  return {
    complete: orgComplete,
    cycle,
    cycleLabel,
    members,
  };
}
