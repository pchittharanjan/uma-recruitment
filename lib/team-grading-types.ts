import type { AssignmentStage } from '@/lib/db';
import type { GradingEditLock } from '@/lib/advancement-submissions-types';

export type GradingNextStep = {
  kind: 'color_recommendations';
  href: string;
  isDirector: boolean;
};

export type TeamGradingData = {
  grader: { id: number; name: string; email: string };
  stage: AssignmentStage;
  assignments: Array<{
    applicationId: number;
    assignmentId: number;
    rowIndex: number;
    status: string;
  }>;
  progress: { completed: number; total: number };
  gradingEditLock: GradingEditLock;
  isDirector: boolean;
  nextStep: GradingNextStep | null;
};

export type TeamGradingResult =
  | { ok: true; data: TeamGradingData }
  | { ok: false; error: string; status: 403 | 400 };
