import { initDb } from '@/lib/db';
import { anyTeamHasActivePipeline } from '@/lib/rounds';
import { ImportBlocked } from '@/components/import-blocked';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { phaseLabel } from '@/lib/stages';
import { runWithRequestCache } from '@/lib/request-cache';

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  return runWithRequestCache(async () => {
    await initDb();
    const pipeline = await getGlobalPipelineState();
    if (pipeline.status === 'closed') {
      return <ImportBlocked message="Recruitment is closed. Imports are disabled for this cycle." />;
    }
    if (await anyTeamHasActivePipeline()) {
      return <ImportBlocked />;
    }
    if (pipeline.status !== 'application') {
      const canAdvanceToApplication =
        pipeline.status === 'pre_application' && pipeline.nextStatus === 'application';

      if (canAdvanceToApplication) {
        return (
          <ImportBlocked
            message="Import is only available once teams are in the Application phase. Advance each team from the Dashboard pipeline controls."
            ctaLabel="Open Dashboard"
            ctaHref="/admin/dashboard#pipeline-controls"
          />
        );
      }

      if (!pipeline.status) {
        return (
          <ImportBlocked
            message="No recruiting cycle yet. Set coffee chat dates on the Dashboard (or Coffee Chats) to start teams, then move to Application."
            ctaLabel="Go to Dashboard"
            ctaHref="/admin/dashboard"
          />
        );
      }

      return (
        <ImportBlocked
          message={`Import is only available in the Application phase. Teams are currently in ${phaseLabel(pipeline.status)}. Use the Dashboard phase controls if you need to change stages.`}
          ctaLabel="Go to Dashboard"
          ctaHref="/admin/dashboard#pipeline-controls"
        />
      );
    }
    return children;
  });
}
