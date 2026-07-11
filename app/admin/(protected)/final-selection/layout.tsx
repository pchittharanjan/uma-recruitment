import AppBreadcrumb from '@/components/app-breadcrumb';

export default function AdminFinalSelectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 pt-4 lg:px-6">
        <AppBreadcrumb />
      </div>
      {children}
    </div>
  );
}
