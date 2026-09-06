/** Href helpers for team vs admin deliberations applicant pages. */

export type DeliberationsAudience = 'team' | 'admin';

export function deliberationsBoardHref(
  teamId: string | number,
  audience: DeliberationsAudience,
): string {
  return audience === 'admin'
    ? `/admin/deliberations?open=${teamId}&active=${teamId}`
    : `/team/${teamId}/deliberations`;
}

export function deliberationsApplicantHref(
  teamId: string | number,
  applicationId: number,
  audience: DeliberationsAudience,
  options?: { name?: string },
): string {
  const base =
    audience === 'admin'
      ? `/admin/teams/${teamId}/deliberations/${applicationId}`
      : `/team/${teamId}/deliberations/${applicationId}`;
  const name = options?.name?.trim();
  if (!name) return base;
  const params = new URLSearchParams();
  params.set('name', name);
  return `${base}?${params.toString()}`;
}

export function deliberationsAudienceFromPathname(
  pathname: string | null | undefined,
): DeliberationsAudience {
  return pathname?.startsWith('/admin/') ? 'admin' : 'team';
}
