/** Href helpers for the team vs admin application-grading surfaces. */

export type GradingAudience = 'team' | 'admin';

export function gradingQueueHref(teamId: string | number, audience: GradingAudience): string {
  return audience === 'admin'
    ? `/admin/teams/${teamId}/grade`
    : `/team/${teamId}/grade`;
}

export function gradingAppHref(
  teamId: string | number,
  applicationId: number,
  audience: GradingAudience,
): string {
  return `${gradingQueueHref(teamId, audience)}/${applicationId}`;
}

export function gradingBackHref(teamId: string | number, audience: GradingAudience): string {
  return audience === 'admin' ? `/admin/teams/${teamId}` : `/team/${teamId}`;
}

export function gradingAudienceFromRole(role: string | undefined | null): GradingAudience {
  return role === 'admin' ? 'admin' : 'team';
}
