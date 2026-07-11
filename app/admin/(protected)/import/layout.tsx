import { initDb } from '@/lib/db';
import { anyTeamHasActivePipeline } from '@/lib/rounds';
import { ImportBlocked } from '@/components/import-blocked';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { phaseLabel } from '@/lib/stages';

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  await initDb();
  const pipeline = await getGlobalPipelineState();
  if (pipeline.status === 'closed') {
    return (
      <ImportBlocked message="Recruitment is closed. This cycle is view-only — imports are disabled." />
    );
  }
  if (await anyTeamHasActivePipeline()) {
    return <ImportBlocked />;
  }
  if (pipeline.status !== 'application') {
    const current = pipeline.status ? phaseLabel(pipeline.status) : 'Coffee Chats';
    return (
      <ImportBlocked
        message={`CSV import opens in Application phase. Current phase: ${current}. Close coffee chats and move to Application when ready.`}
      />
    );
  }
  return children;
}
