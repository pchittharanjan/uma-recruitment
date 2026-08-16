'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useOptionalShellUser } from '@/components/shell-user-provider';
import {
  buildBreadcrumbs,
  extractTeamIdFromPath,
  parseInterviewScorePath,
  shouldShowBreadcrumbs,
  type BreadcrumbItem as BreadcrumbEntry,
} from '@/lib/breadcrumbs';

export default function AppBreadcrumb({
  teamId,
  teamName,
}: {
  teamId?: string;
  teamName?: string;
}) {
  const pathname = usePathname();

  if (!shouldShowBreadcrumbs(pathname)) {
    return null;
  }

  return <TeamBreadcrumbTrail pathname={pathname} teamId={teamId} teamName={teamName} />;
}

function BreadcrumbTrail({ items }: { items: BreadcrumbEntry[] }) {
  if (items.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${item.href ?? 'current'}-${item.label}`}>
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={item.href} />}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function TeamBreadcrumbTrail({
  pathname,
  teamId: teamIdProp,
  teamName,
}: {
  pathname: string;
  teamId?: string;
  teamName?: string;
}) {
  const shell = useOptionalShellUser();
  const teamId = teamIdProp ?? extractTeamIdFromPath(pathname);
  const interviewScore = parseInterviewScorePath(pathname);
  const shellTeamName =
    teamName ??
    (teamId
      ? shell?.teams.find((t) => String(t.id) === teamId)?.name
      : undefined);
  const [teamNames, setTeamNames] = useState<Record<string, string>>(() =>
    teamId && shellTeamName ? { [teamId]: shellTeamName } : {},
  );
  const [interviewProgress, setInterviewProgress] = useState<
    Record<string, { current: number; total: number }>
  >({});

  useEffect(() => {
    if (!teamId || !shellTeamName) return;
    setTeamNames((prev) =>
      prev[teamId] === shellTeamName ? prev : { ...prev, [teamId]: shellTeamName },
    );
  }, [teamId, shellTeamName]);

  useEffect(() => {
    if (!interviewScore) return;

    const { teamId: matchedTeamId, stage, applicationId } = interviewScore;
    if (interviewProgress[applicationId]) return;

    let cancelled = false;

    const loadInterviewProgress = async () => {
      try {
        const res = await fetch(
          `/api/team/interviews/${applicationId}?teamId=${matchedTeamId}&stage=${stage}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.interviewProgress) {
          setInterviewProgress((prev) => ({
            ...prev,
            [applicationId]: json.interviewProgress,
          }));
        }
      } catch {
        // Keep fallback label from buildBreadcrumbs.
      }
    };

    void loadInterviewProgress();

    return () => {
      cancelled = true;
    };
  }, [pathname, interviewScore, interviewProgress]);

  const items = buildBreadcrumbs(pathname, { teamNames, interviewProgress });
  return <BreadcrumbTrail items={items} />;
}
