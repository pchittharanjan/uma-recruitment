import { FileSpreadsheetIcon } from 'lucide-react';
import { CenteredMessage } from '@/components/centered-message';
import { EraseTestDataButton } from '@/components/erase-test-data-button';
import { PageContainer, PageHeader } from '@/components/page-shell';
import { phasePageEyebrow } from '@/lib/stages';

export function ImportBlocked({
  message = 'Applications are already imported. Track grading from the dashboard.',
  hint,
  ctaLabel = 'Go to dashboard',
  ctaHref = '/admin/dashboard#pipeline-controls',
  children,
}: {
  message?: string;
  hint?: string;
  ctaLabel?: string;
  ctaHref?: string;
  children?: React.ReactNode;
}) {
  const reimportHint =
    hint ??
    'Import runs once per cycle. To import again, use Erase test data on the dashboard or import page first.';

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={phasePageEyebrow('application')}
        title="Import Applications"
        description="Load this cycle’s spreadsheet, pick questions and criteria, preview the grader view, then assign users. Unlock grading later from the dashboard."
        actions={<EraseTestDataButton redirectTo="/admin/import" />}
      />

      <CenteredMessage
        icon={FileSpreadsheetIcon}
        title="Import unavailable"
        description={message}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        className="min-h-[min(52vh,28rem)] rounded-xl bg-surface-panel"
      >
        {children ?? (
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {reimportHint}
          </p>
        )}
      </CenteredMessage>
    </PageContainer>
  );
}
