'use client';

import { useEffect, useState } from 'react';
import StatusBanner from '@/components/status-banner';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';

/**
 * Persistent notice when the recruitment cycle is closed.
 * Admin: informational only (writes still allowed).
 * Team: archive / view-only.
 */
export function PipelineClosedBanner({
  statusUrl,
}: {
  statusUrl: '/api/admin/phase' | '/api/team/nav';
}) {
  const [closed, setClosed] = useState(false);
  const isAdmin = statusUrl === '/api/admin/phase';

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(statusUrl, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (cancelled || !json) return;
          setClosed(json.status === 'closed' || Boolean(json.pipelineClosed));
        })
        .catch(() => {});
    };
    load();
    const onChange = () => load();
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    };
  }, [statusUrl]);

  if (!closed) return null;

  return (
    <div className="border-b border-border/60 px-5 py-2 sm:px-8">
      <StatusBanner
        type="info"
        message={
          isAdmin
            ? 'This recruitment cycle is closed. Team members are view-only — you can still send outcome emails and make admin changes.'
            : 'This recruitment cycle is closed. Everything is view-only — no scores, notes, schedules, or decisions can be changed.'
        }
      />
    </div>
  );
}
