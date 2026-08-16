import { initDb } from '@/lib/db';
import { anyTeamHasActivePipeline } from '@/lib/rounds';
import { ImportBlocked } from '@/components/import-blocked';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  await initDb();
  const pipeline = await getGlobalPipelineState();
  if (pipeline.status === 'closed') {
    return <ImportBlocked message="Recruitment is closed. Imports are disabled for this cycle." />;
  }
  if (await anyTeamHasActivePipeline()) {
    return <ImportBlocked />;
  }
  if (pipeline.status !== 'application') {
    return (
      <ImportBlocked
        message="Import is only available in the Application phase. On the Dashboard, use Move All teams to Application."
        ctaLabel="Move All teams to Application →"
        ctaHref="/admin/dashboard#move-all-teams"
      />
    );
  }
  return children;
}
