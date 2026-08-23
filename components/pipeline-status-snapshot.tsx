'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { RoundStatus } from '@/lib/db';
import { phaseLabelForTeam } from '@/lib/team-pipeline-profile';
import { teamLinkClass, teamStageBadgeClass } from '@/lib/team-colors';
import { cn } from '@/lib/utils';

/** Read-only team pipeline status — manage advances on the dashboard. */
export function PipelineStatusSnapshot({
  teamName,
  status,
}: {
  teamName: string;
  status: RoundStatus;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle>{teamName} pipeline</CardTitle>
            <span
              className={cn(
                'inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium',
                teamStageBadgeClass(teamName),
              )}
            >
              {phaseLabelForTeam(status, teamName)}
            </span>
          </div>
          <Link
            href="/admin/dashboard#pipeline-controls"
            className={cn(
              'shrink-0 text-sm font-medium underline-offset-2 hover:underline',
              teamLinkClass(teamName),
            )}
          >
            Manage on dashboard
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Each team advances on its own schedule. Use the dashboard team cards to move phases and
          unlock stages.
        </p>
      </CardContent>
    </Card>
  );
}
