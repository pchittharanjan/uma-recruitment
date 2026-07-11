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
  const teamId = teamIdProp ?? extractTeamIdFromPath(pathname);
  const interviewScore = parseInterviewScorePath(pathname);
  const [teamNames, setTeamNames] = useState<Record<string, string>>(() =>
    teamId && teamName ? { [teamId]: teamName } : {},
  );
  const [interviewProgress, setInterviewProgress] = useState<
    Record<string, { current: number; total: number }>
  >({});

  // Prefer the name passed from the shell/layout over the "Team {id}" fallback.
  useEffect(() => {
    if (!teamId || !teamName) return;
    setTeamNames((prev) => (prev[teamId] === teamName ? prev : { ...prev, [teamId]: teamName }));
  }, [teamId, teamName]);

  useEffect(() => {
    if (!teamId || teamNames[teamId] || interviewScore) return;

    let cancelled = false;

    const loadTeamName = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const json = await res.json();
        const team = json.teams?.find((entry: { id: number }) => String(entry.id) === teamId);
        if (!cancelled && team?.name) {
          setTeamNames((prev) => ({ ...prev, [teamId]: team.name }));
        }
      } catch {
        // Keep fallback label from buildBreadcrumbs.
      }
    };

    void loadTeamName();

    return () => {
      cancelled = true;
    };
  }, [pathname, teamId, teamNames, interviewScore]);

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
