/** Href helpers for the team vs admin interview surfaces. */

export type InterviewAudience = 'team' | 'admin';

export function interviewQueueHref(
  teamId: string | number,
  stage: string,
  audience: InterviewAudience,
): string {
  return audience === 'admin'
    ? `/admin/teams/${teamId}/interviews/${stage}`
    : `/team/${teamId}/interviews/${stage}`;
}

export function interviewAppHref(
  teamId: string | number,
  stage: string,
  applicationId: number,
  audience: InterviewAudience,
): string {
  return `${interviewQueueHref(teamId, stage, audience)}/${applicationId}`;
}

export function interviewBackHref(teamId: string | number, audience: InterviewAudience): string {
  return audience === 'admin' ? `/admin/teams/${teamId}` : `/team/${teamId}`;
}

export function interviewAudienceFromRole(role: string | undefined | null): InterviewAudience {
  return role === 'admin' ? 'admin' : 'team';
}

export function interviewAudienceFromPathname(pathname: string | null | undefined): InterviewAudience {
  return pathname?.startsWith('/admin/') ? 'admin' : 'team';
}
