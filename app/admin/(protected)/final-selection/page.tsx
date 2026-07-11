'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import {
  FinalSelectionOffers,
  type FinalSelectionOffer,
} from '@/components/final-selection-offers-table';
import { PageContainer } from '@/components/page-shell';

export default function AdminFinalSelectionPage() {
  const router = useRouter();
  const [cycleLabel, setCycleLabel] = useState('');
  const [members, setMembers] = useState<FinalSelectionOffer[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/final-selection', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load final selection.');
        return json as { cycleLabel: string; members: FinalSelectionOffer[] };
      })
      .then((json) => {
        if (!json) return;
        setCycleLabel(json.cycleLabel);
        setMembers(json.members ?? []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load final selection.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <PageLoading />;

  return (
    <PageContainer className="space-y-6">
      {error && <StatusBanner type="error" message={error} />}
      <FinalSelectionOffers
        cycleLabel={cycleLabel}
        members={members}
        emptyHint="No offers have been locked in yet. Complete final selection on each deliberations board first."
      />
    </PageContainer>
  );
}
