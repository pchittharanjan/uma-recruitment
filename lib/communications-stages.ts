import type { RoundStatus } from '@/lib/db';

/** Email moments after each advancement decision. */
export type OutcomeEmailStage = 'application' | 'first_round' | 'final_round';

export const OUTCOME_EMAIL_STAGES: OutcomeEmailStage[] = [
  'application',
  'first_round',
  'final_round',
];

export function parseOutcomeEmailStage(
  value: string | null | undefined,
  fallback: OutcomeEmailStage = 'application',
): OutcomeEmailStage {
  if (value === 'application' || value === 'first_round' || value === 'final_round') {
    return value;
  }
  // Accept checklist/view aliases.
  if (value === 'deliberations' || value === 'final-round') return 'final_round';
  if (value === 'first-round') return 'first_round';
  return fallback;
}

/** Default email moment from the admin pipeline / checklist phase. */
export function outcomeEmailStageFromPipeline(
  status: RoundStatus | null | undefined,
): OutcomeEmailStage {
  switch (status) {
    case 'first_round':
      return 'first_round';
    case 'final_round':
    case 'deliberations':
    case 'closed':
      return 'final_round';
    case 'application':
    case 'pre_application':
    default:
      return 'application';
  }
}

export function outcomeEmailTargetLabel(stage: OutcomeEmailStage): string {
  switch (stage) {
    case 'application':
      return 'First Round Interview';
    case 'first_round':
      return 'Final Round Interview';
    case 'final_round':
      return 'the team';
  }
}

export function outcomeEmailPhaseEyebrow(stage: OutcomeEmailStage): string {
  switch (stage) {
    case 'application':
      return 'Application phase';
    case 'first_round':
      return 'First Round Interview';
    case 'final_round':
      return 'Final Round / Deliberations';
  }
}

export function outcomeEmailPageDescription(stage: OutcomeEmailStage): string {
  switch (stage) {
    case 'application':
      return 'After advancement lists are approved, email each applicant whether they advanced to First Round Interview or not.';
    case 'first_round':
      return 'After first-round advancement lists are approved, email each applicant whether they advanced to Final Round Interview or not.';
    case 'final_round':
      return 'After final decisions, email each applicant whether they received an offer or not.';
  }
}

export function outcomeEmailPassCardTitle(stage: OutcomeEmailStage): string {
  switch (stage) {
    case 'application':
      return 'Advancing to First Round';
    case 'first_round':
      return 'Advancing to Final Round';
    case 'final_round':
      return 'Receiving an offer';
  }
}

export function communicationsHref(stage: OutcomeEmailStage, teamId?: number): string {
  const base = teamId
    ? `/admin/teams/${teamId}/communications`
    : '/admin/communications';
  return `${base}?fromStage=${stage}`;
}
