import Link from 'next/link';
import ProfileMenu from '@/components/profile-menu';
import AppBreadcrumb from '@/components/app-breadcrumb';

interface AppHeaderUser {
  name: string;
  email: string;
  role: string;
}

export default function AppHeader({
  user,
  homeHref,
}: {
  user: AppHeaderUser;
  homeHref: string;
}) {
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex min-h-14 w-full max-w-[120rem] items-center justify-between gap-4 px-5 py-2 sm:px-8 lg:px-10 xl:px-14 2xl:px-16">
        <div className="min-w-0 flex-1">
          <Link
            href={homeHref}
            className="text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
          >
            UMA Recruitment
          </Link>
          <AppBreadcrumb />
        </div>
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
