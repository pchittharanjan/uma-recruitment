'use client';

import { ThinkingOrb } from 'thinking-orbs';
import { PageContainer } from '@/components/page-shell';
import { cn } from '@/lib/utils';

const ORB_SPEED = 1.5;

/** Full-page replacement only — never nest inside a card, sheet, or settings panel. */
export default function PageLoading({ className }: { className?: string }) {
  return (
    <PageContainer
      className={cn('flex min-h-[60vh] items-center justify-center', className)}
    >
      <ThinkingOrb state="composing" size={64} speed={ORB_SPEED} theme="light" />
    </PageContainer>
  );
}
