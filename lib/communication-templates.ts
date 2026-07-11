import type { OutcomeEmailStage } from '@/lib/communications-stages';

export interface RoundCommunicationsTemplates {
  passSubject: string;
  passBody: string;
  rejectSubject: string;
  rejectBody: string;
}

const STAGE_DEFAULTS: Record<
  OutcomeEmailStage,
  RoundCommunicationsTemplates
> = {
  application: {
    passSubject: 'UMA {team} — First Round Invitation',
    passBody:
      'Hi {name},\n\nCongratulations! You have been invited to the First Round Interview for UMA {team}.\n\nWe will follow up with scheduling details soon.\n\nBest,\nUMA Recruitment',
    rejectSubject: 'UMA {team} — Application update',
    rejectBody:
      'Hi {name},\n\nThank you for applying to UMA {team}. After careful review, we are unable to move forward with your application at this time.\n\nWe appreciate your interest and wish you the best.\n\nBest,\nUMA Recruitment',
  },
  first_round: {
    passSubject: 'UMA {team} — Final Round Invitation',
    passBody:
      'Hi {name},\n\nCongratulations! You have been invited to the Final Round Interview for UMA {team}.\n\nWe will follow up with scheduling details soon.\n\nBest,\nUMA Recruitment',
    rejectSubject: 'UMA {team} — First Round update',
    rejectBody:
      'Hi {name},\n\nThank you for interviewing with UMA {team}. After careful review, we are unable to move you forward to Final Round at this time.\n\nWe appreciate your time and wish you the best.\n\nBest,\nUMA Recruitment',
  },
  final_round: {
    passSubject: 'UMA {team} — Welcome to the team',
    passBody:
      'Hi {name},\n\nCongratulations! We are excited to offer you a spot on UMA {team}.\n\nWe will follow up with next steps soon.\n\nBest,\nUMA Recruitment',
    rejectSubject: 'UMA {team} — Final decision',
    rejectBody:
      'Hi {name},\n\nThank you for your time throughout the UMA {team} recruitment process. After careful deliberation, we are unable to offer you a spot at this time.\n\nWe appreciate your interest and wish you the best.\n\nBest,\nUMA Recruitment',
  },
};

/** @deprecated Prefer defaultsForOutcomeEmailStage('application') */
export const DEFAULT_PASS_SUBJECT = STAGE_DEFAULTS.application.passSubject;
/** @deprecated Prefer defaultsForOutcomeEmailStage('application') */
export const DEFAULT_PASS_BODY = STAGE_DEFAULTS.application.passBody;
/** @deprecated Prefer defaultsForOutcomeEmailStage('application') */
export const DEFAULT_REJECT_SUBJECT = STAGE_DEFAULTS.application.rejectSubject;
/** @deprecated Prefer defaultsForOutcomeEmailStage('application') */
export const DEFAULT_REJECT_BODY = STAGE_DEFAULTS.application.rejectBody;

export function defaultsForOutcomeEmailStage(
  stage: OutcomeEmailStage,
): RoundCommunicationsTemplates {
  return { ...STAGE_DEFAULTS[stage] };
}

export function applyCommunicationTemplate(
  template: string,
  vars: { name: string; team: string },
): string {
  return template.replace(/\{name\}/g, vars.name).replace(/\{team\}/g, vars.team);
}

export function buildMailtoUrl(options: {
  to?: string;
  bcc?: string[];
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams();
  if (options.bcc?.length) params.set('bcc', options.bcc.join(','));
  params.set('subject', options.subject);
  params.set('body', options.body);
  const query = params.toString();
  return query ? `mailto:${options.to ?? ''}?${query}` : `mailto:${options.to ?? ''}`;
}
