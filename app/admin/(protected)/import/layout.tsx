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
            message="Import is only available once teams are in the Application phase."
            ctaLabel="Open Dashboard"
            ctaHref="/admin/dashboard#pipeline-controls"
          >
            <ol className="space-y-2 text-left text-sm leading-relaxed text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1.</span> Open the Dashboard and
                advance each team to Application.
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span> Return here to import your
                CSV.
              </li>
            </ol>
          </ImportBlocked>
        );
      }

      if (!pipeline.status) {
        return (
          <ImportBlocked
            message="No recruiting cycle yet."
            ctaLabel="Go to Dashboard"
            ctaHref="/admin/dashboard#pipeline-controls"
          >
            <ol className="space-y-2 text-left text-sm leading-relaxed text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1.</span> Open the Dashboard and
                advance each team to Application.
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span> Return here to import your
                CSV.
              </li>
            </ol>
          </ImportBlocked>
        );
      }

      return (
        <ImportBlocked
          message={`Import is only available in the Application phase. Teams are currently in ${phaseLabel(pipeline.status)}.`}
          ctaLabel="Go to Dashboard"
          ctaHref="/admin/dashboard#pipeline-controls"
        >
          <ol className="space-y-2 text-left text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1.</span> Use Dashboard phase controls
              to move teams back to Application if needed.
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span> Return here to import your
              CSV.
            </li>
          </ol>
        </ImportBlocked>
      );
    }
    return children;
  });
}
