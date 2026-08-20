import 'server-only';

import type { AssignmentStage, User } from '@/lib/db';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { isTeamDirector } from '@/lib/directors';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { listGraderAssignments, userSeesBlindApplications } from '@/lib/team-dashboard';
import type { TeamGradingResult } from '@/lib/team-grading-types';

export type { TeamGradingData, TeamGradingResult } from '@/lib/team-grading-types';

const ASSIGNMENT_STAGES: AssignmentStage[] = ['application', 'first_round', 'final_round'];

export async function buildTeamGradingData(
  user: User,
  teamId: number,
  stageRaw = 'application',
): Promise<TeamGradingResult> {
  if (!Number.isFinite(teamId)) {
    return { ok: false, error: 'teamId is required.', status: 400 };
  }
  if (!ASSIGNMENT_STAGES.includes(stageRaw as AssignmentStage)) {
    return { ok: false, error: 'Invalid stage.', status: 400 };
  }
  const stage = stageRaw as AssignmentStage;

  if (!(await canUserAccessTeamStage(user, teamId, stage))) {
    return { ok: false, error: 'This stage is not open for you yet.', status: 403 };
  }

  const [assignments, round] = await Promise.all([
    listGraderAssignments(user.id, teamId, stage),
    getActiveRoundForTeam(teamId),
  ]);
  const completed = assignments.filter((a) => a.status === 'completed').length;

  const gradingEditLock = round
    ? await getGradingEditLock(teamId, round.id)
    : { locked: false, reason: null, message: '' };

  const allDone = assignments.length > 0 && completed === assignments.length;
  const canOpenApplicationAdvancement = user.role === 'exec' && stage === 'application';
  const isDirector =
    canOpenApplicationAdvancement && (await isTeamDirector(user.id, teamId));
  const nextStep =
    allDone && canOpenApplicationAdvancement && !gradingEditLock.locked
      ? {
          kind: 'color_recommendations' as const,
          href: `/team/${teamId}/advancement`,
          isDirector,
        }
      : null;

  const blind = userSeesBlindApplications(user);
  const safeAssignments = blind
    ? assignments.map(({ candidateName: _name, ...rest }) => rest)
    : assignments;

  return {
    ok: true,
    data: {
      grader: { id: user.id, name: user.name, email: user.email },
      stage,
      assignments: safeAssignments,
      progress: { completed, total: assignments.length },
      gradingEditLock,
      isDirector,
      nextStep,
    },
  };
}
