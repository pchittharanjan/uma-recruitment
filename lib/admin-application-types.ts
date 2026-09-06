import type { ApplicationStage, RejectedFromStage } from '@/lib/db';

export interface AdminApplicationRow {
  id: number;
  rowIndex: number;
  stage: ApplicationStage;
  rejectedFromStage: RejectedFromStage | null;
  teamId: number;
  teamName: string;
  roundId: number;
  candidateId: number;
  candidateName: string;
  candidateEmail: string;
  finalScore: number | null;
  rank: number | null;
  adminNote: string | null;
  /** Completed / total assignments for the same stage as Score (not all pipeline stages). */
  graderCompleted: number;
  graderTotal: number;
}

export interface AdminApplicationDetail extends AdminApplicationRow {
  fields: Record<string, string>;
}
