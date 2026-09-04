'use client';

import { useState } from 'react';
import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveLinkPreview } from '@/lib/link-preview';
import { cn } from '@/lib/utils';

type Props = {
  url: string;
  /** Shown on the open-in-new-tab button, e.g. "APP-003 - Portfolio". */
  openLabel?: string;
  className?: string;
  /** Compact height for stacked portfolio fields. */
  compact?: boolean;
  /**
   * Application grading / other name-blind views.
   * Open in Drive stays available; file titles on Drive can still identify the applicant
   * unless files were copied under a blind name at import.
   */
  blind?: boolean;
};

export function PortfolioLinkPreview({
  url,
  openLabel,
  className,
  compact,
}: Props) {
  const preview = resolveLinkPreview(url);
  const [expanded, setExpanded] = useState(false);
  const [frameError, setFrameError] = useState(false);

  if (!preview) {
    return <p className="text-sm">{url}</p>;
  }

  const canEmbed =
    !frameError &&
    (preview.kind === 'iframe' || preview.kind === 'image') &&
    Boolean(preview.embedUrl);

  const heightClass = expanded
    ? 'h-[min(70vh,36rem)]'
    : compact
      ? 'h-56'
      : 'h-72 sm:h-80';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-fit normal-case"
          nativeButton={false}
          render={
            <a href={preview.originalUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {openLabel ?? `Open ${preview.label}`}
        </Button>
        {canEmbed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <Minimize2 className="size-3.5" aria-hidden />
                Smaller
              </>
            ) : (
              <>
                <Maximize2 className="size-3.5" aria-hidden />
                Larger
              </>
            )}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">{preview.label}</span>
      </div>

      {canEmbed && preview.embedUrl ? (
        <div
          className={cn(
            'overflow-hidden rounded-lg border border-border bg-[var(--surface-raised)]',
            heightClass,
          )}
        >
          {preview.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- applicant-submitted arbitrary URLs
            <img
              src={preview.embedUrl}
              alt={openLabel ?? 'Applicant upload'}
              className="h-full w-full object-contain"
              onError={() => setFrameError(true)}
            />
          ) : (
            <iframe
              title={openLabel ?? `${preview.label} preview`}
              src={preview.embedUrl}
              className="h-full w-full border-0"
              allow="fullscreen"
              referrerPolicy="no-referrer"
              onError={() => setFrameError(true)}
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Can&apos;t preview this link in-app
          {preview.kind === 'external' || frameError ? ' — open it in a new tab.' : '.'}
        </p>
      )}
    </div>
  );
}
