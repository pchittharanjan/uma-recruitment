import { redirect } from 'next/navigation';
import { openTeamDeliberationsHref } from '@/lib/deliberations-workspace';

/** Deep link into the multi-tab deliberations workspace with this team focused. */
export default async function TeamDeliberationsRedirectPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const id = Number.parseInt(teamId, 10);
  if (!Number.isFinite(id) || id < 1) {
    redirect('/admin/deliberations');
  }
  redirect(openTeamDeliberationsHref(id));
}
