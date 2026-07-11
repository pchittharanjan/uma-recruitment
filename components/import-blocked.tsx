import Link from 'next/link';
import { PageContainer, PageContent, PageHeader, PagePanel } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { EraseTestDataButton } from '@/components/erase-test-data-button';

export function ImportBlocked({
  message = 'Applications are already imported for this round. Use the dashboard to track grading progress and open each team.',
}: {
  message?: string;
}) {
  return (
    <PageContainer size="wide" className="space-y-5">
      <PageHeader
        title="Import applications"
        actions={<EraseTestDataButton redirectTo="/admin/import" />}
      />
      <PageContent width="comfortable">
        <PagePanel className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button nativeButton={false} render={<Link href="/admin/dashboard" />}>
            Go to dashboard
          </Button>
        </PagePanel>
      </PageContent>
    </PageContainer>
  );
}
