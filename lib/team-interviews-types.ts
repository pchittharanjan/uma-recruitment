import type { AssignmentStage } from '@/lib/db';

export type InterviewNextStep = {
  kind: 'color_recommendations';
  href: string;
  isDirector: boolean;
};

export type TeamInterviewAssignment = {
  applicationId: number;
  assignmentId: number;
  rowIndex: number;
  candidateName: string;
  status: string;
  scheduledAt: string | null;
  location: string | null;
  logisticsNote: string | null;
  groupKey: string | null;
};

export type TeamInterviewData = {
  grader: { id: number; name: string; email: string };
  stage: AssignmentStage;
  stageLabel: string;
  assignments: TeamInterviewAssignment[];
  progress: { completed: number; total: number };
  isDirector: boolean;
  nextStep: InterviewNextStep | null;
};

export type TeamInterviewResult =
  | { ok: true; data: TeamInterviewData }
  | { ok: false; error: string; status: 403 | 400 };
