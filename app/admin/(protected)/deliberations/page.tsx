'use client';

import { Suspense } from 'react';
import { DeliberationsWorkspace } from '@/components/deliberations-workspace';
import PageLoading from '@/components/page-loading';

export default function AdminDeliberationsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DeliberationsWorkspace />
    </Suspense>
  );
}
