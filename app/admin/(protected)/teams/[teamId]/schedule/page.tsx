import { redirect } from 'next/navigation';
import { initDb } from '@/lib/db';
import { getActiveRoundForTeam } from '@/lib/rounds';

export default async function TeamScheduleIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { teamId } = await params;
  const { stage } = await searchParams;

  const normalizedStage = stage?.replace('-', '_');

  if (normalizedStage === 'final_round') {
    redirect(`/admin/teams/${teamId}/schedule/final-round`);
  }
  if (normalizedStage === 'first_round') {
    redirect(`/admin/teams/${teamId}/schedule/first-round`);
  }

  await initDb();
  const teamIdNum = Number.parseInt(teamId, 10);
  if (Number.isFinite(teamIdNum)) {
    const round = await getActiveRoundForTeam(teamIdNum);
    if (round?.status === 'final_round' || round?.status === 'deliberations') {
      redirect(`/admin/teams/${teamId}/schedule/final-round`);
    }
  }

  redirect(`/admin/teams/${teamId}/schedule/first-round`);
}
