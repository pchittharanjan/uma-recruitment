import { FileSpreadsheetIcon } from 'lucide-react';
import { AdvancePipelineButton } from '@/components/advance-pipeline-button';
import { CenteredMessage } from '@/components/centered-message';
import { EraseTestDataButton } from '@/components/erase-test-data-button';

export function ImportBlocked({
  message = 'Applications are already imported. Track grading from the dashboard.',
  ctaLabel = 'Go to dashboard',
  ctaHref = '/admin/dashboard',
  /** When true, CTA advances the global pipeline instead of navigating away. */
  advancePipeline = false,
}: {
  message?: string;
  ctaLabel?: string;
  ctaHref?: string;
  advancePipeline?: boolean;
}) {
  return (
    <CenteredMessage
      icon={FileSpreadsheetIcon}
      title="Import applications"
      description={message}
      ctaLabel={advancePipeline ? undefined : ctaLabel}
      ctaHref={advancePipeline ? undefined : ctaHref}
      corner={<EraseTestDataButton redirectTo="/admin/import" />}
    >
      {advancePipeline ? (
        <div className="mt-2 flex justify-center">
          <AdvancePipelineButton label={ctaLabel} redirectTo="/admin/import" />
        </div>
      ) : null}
    </CenteredMessage>
  );
}
