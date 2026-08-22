import { initDb } from '@/lib/db';
import {
  getAssignmentReviewState,
  type AssignmentReviewState,
} from '@/lib/assignment-admin';
import { PageContainer } from '@/components/page-shell';
import StatusBanner from '@/components/status-banner';
import { AdminAssignmentReview } from '@/components/admin-assignment-review';

export default async function TeamAssignmentsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId: teamIdRaw } = await params;
  const teamId = Number.parseInt(teamIdRaw, 10);
  if (!Number.isFinite(teamId)) {
    return (
      <PageContainer>
        <StatusBanner message="Invalid team id." type="error" />
      </PageContainer>
    );
  }

  await initDb();

  let data: AssignmentReviewState | null = null;
  let loadError = '';
  try {
    data = await getAssignmentReviewState(teamId);
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load assignments';
  }

  if (!data) {
    return (
      <PageContainer>
        <StatusBanner message={loadError || 'Failed to load assignments'} type="error" />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide">
      <AdminAssignmentReview key={String(teamId)} teamId={String(teamId)} initialData={data} />
    </PageContainer>
  );
}
