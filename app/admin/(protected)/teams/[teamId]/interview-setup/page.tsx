import dynamic from 'next/dynamic';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

const TeamInterviewGuideSetup = dynamic(
  () =>
    import('@/components/team-interview-guide-setup').then(
      (mod) => mod.TeamInterviewGuideSetup,
    ),
  {
    loading: () => (
      <div className="space-y-4" role="status" aria-label="Loading" data-page-loading="">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

export default async function TeamInterviewSetupPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <PageContainer size="wide">
      <PageSection>
        <PageHeader title="Interview Setup" />
        <TeamInterviewGuideSetup teamId={teamId} />
      </PageSection>
    </PageContainer>
  );
}
