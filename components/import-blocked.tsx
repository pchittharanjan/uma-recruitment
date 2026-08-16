import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
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
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        title="Import applications"
        description={message}
        actions={<EraseTestDataButton redirectTo="/admin/import" />}
      />
      <Button nativeButton={false} render={<Link href={ctaHref} />}>
        {ctaLabel}
      </Button>
    </PageContainer>
  );
}
