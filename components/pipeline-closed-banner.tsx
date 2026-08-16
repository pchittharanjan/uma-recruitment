'use client';

import StatusBanner from '@/components/status-banner';
import { useAdminPhase } from '@/components/admin-phase-provider';
import { useTeamNav } from '@/components/team-nav-provider';

/**
 * Persistent notice when the recruitment cycle is closed.
 * Admin: informational only (writes still allowed).
 * Team: archive / view-only.
 *
 * Reads from the shared shell provider — no extra fetch.
 */
export function PipelineClosedBanner({
  statusUrl,
}: {
  statusUrl: '/api/admin/phase' | '/api/team/nav';
}) {
  const isAdmin = statusUrl === '/api/admin/phase';
  return isAdmin ? <AdminClosedBanner /> : <TeamClosedBanner />;
}

function AdminClosedBanner() {
  const { phase } = useAdminPhase();
  if (!phase?.pipelineClosed) return null;
  return (
    <ClosedBannerMessage message="This recruitment cycle is closed. Team members are view-only — you can still send outcome emails and make admin changes." />
  );
}

function TeamClosedBanner() {
  const { nav } = useTeamNav();
  if (!nav?.pipelineClosed) return null;
  return (
    <ClosedBannerMessage message="This recruitment cycle is closed. Everything is view-only — no scores, notes, schedules, or decisions can be changed." />
  );
}

function ClosedBannerMessage({ message }: { message: string }) {
  return (
    <div className="px-5 py-2 sm:px-8">
      <StatusBanner type="info" message={message} />
    </div>
  );
}
