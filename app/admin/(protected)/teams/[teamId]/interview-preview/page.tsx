'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import { readInterviewPreviewGuide } from '@/lib/interview-preview-storage';

export default function AdminInterviewPreviewIndexPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();

  useEffect(() => {
    const hasFinal = Boolean(readInterviewPreviewGuide(teamId, 'final_round'));
    const hasFirst = Boolean(readInterviewPreviewGuide(teamId, 'first_round'));
    const stage = hasFinal && !hasFirst ? 'final_round' : 'first_round';
    router.replace(`/admin/teams/${teamId}/interview-preview/${stage}`);
  }, [router, teamId]);

  return <PageLoading />;
}
