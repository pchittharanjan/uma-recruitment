import AppBreadcrumb from '@/components/app-breadcrumb';
import { pagePaddingX } from '@/components/page-shell';
import { cn } from '@/lib/utils';

export default function AdminCommunicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className={cn(pagePaddingX, 'pt-4')}>
        <AppBreadcrumb />
      </div>
      {children}
    </div>
  );
}
