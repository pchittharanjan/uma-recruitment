import { PageContainer } from '@/components/page-shell';
import { Ripple } from '@/components/ui/ripple';
import { cn } from '@/lib/utils';

export default function PageLoading({ className }: { className?: string }) {
  return (
    <PageContainer
      className={cn('flex min-h-[60vh] items-center justify-center', className)}
    >
      <Ripple className="size-11 text-muted-foreground" />
    </PageContainer>
  );
}
