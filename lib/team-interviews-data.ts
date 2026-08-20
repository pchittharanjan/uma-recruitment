import 'server-only';

import type { AssignmentStage, User } from '@/lib/db';
import { isTeamDirector } from '@/lib/directors';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { listGraderAssignments } from '@/lib/team-dashboard';
import { assignmentStageLabel } from '@/lib/stages';
import type { TeamInterviewResult } from '@/lib/team-interviews-types';

export type {
  TeamInterviewAssignment,
  TeamInterviewData,
  TeamInterviewResult,
} from '@/lib/team-interviews-types';

const ASSIGNMENT_STAGES: AssignmentStage[] = ['application', 'first_round', 'final_round'];

export async function buildTeamInterviewData(
  user: User,
  teamId: number,
  stageRaw: string,
): Promise<TeamInterviewResult> {
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

  const assignments = await listGraderAssignments(user.id, teamId, stage);
  const completed = assignments.filter((a) => a.status === 'completed').length;
  const allDone = assignments.length > 0 && completed === assignments.length;
  const canOpenFirstRoundAdvancement = user.role === 'exec' && stage === 'first_round';
  const isDirector =
    canOpenFirstRoundAdvancement && (await isTeamDirector(user.id, teamId));
  const nextStep =
    allDone && canOpenFirstRoundAdvancement
      ? {
          kind: 'color_recommendations' as const,
          href: `/team/${teamId}/advancement/first-round`,
          isDirector,
        }
      : null;

  return {
    ok: true,
    data: {
      grader: { id: user.id, name: user.name, email: user.email },
      stage,
      stageLabel: assignmentStageLabel(stage),
      assignments,
      progress: { completed, total: assignments.length },
      isDirector,
      nextStep,
    },
  };
}
