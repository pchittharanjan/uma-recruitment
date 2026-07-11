import { notFound, redirect } from 'next/navigation';
import { parseAdminPhaseSlug } from '@/lib/stages';

/** Legacy phase hub URLs redirect to the phase-adaptive dashboard. */
export default async function AdminPhaseRedirectPage({
  params,
}: {
  params: Promise<{ phase: string }>;
}) {
  const { phase: phaseSlug } = await params;
  const phaseStatus = parseAdminPhaseSlug(phaseSlug);
  if (!phaseStatus || phaseStatus === 'application') notFound();
  redirect('/admin/dashboard');
}
