import { FileSpreadsheetIcon } from 'lucide-react';
import { CenteredMessage } from '@/components/centered-message';
import { EraseTestDataButton } from '@/components/erase-test-data-button';

export function ImportBlocked({
  message = 'Applications are already imported. Track grading from the dashboard.',
  ctaLabel = 'Go to dashboard',
  ctaHref = '/admin/dashboard',
}: {
  message?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <CenteredMessage
      icon={FileSpreadsheetIcon}
      title="Import Applications"
      description={message}
      ctaLabel={ctaLabel}
      ctaHref={ctaHref}
      corner={<EraseTestDataButton redirectTo="/admin/import" />}
    />
  );
}
