import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Full-viewport-ish empty / blocked message — title, copy, optional CTA.
 * Use for page-level “nothing here yet” states (not inline table empties).
 */
export function CenteredMessage({
  title,
  description,
  icon: Icon = InboxIcon,
  ctaLabel,
  ctaHref,
  onCtaClick,
  ctaClassName,
  corner,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  ctaClassName?: string;
  /** Optional corner action (e.g. Erase test data). */
  corner?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const showCta = Boolean(ctaLabel && (ctaHref || onCtaClick));

  return (
    <div
      className={cn(
        'relative flex min-h-[min(70vh,40rem)] flex-1 flex-col',
        className,
      )}
    >
      {corner ? (
        <div className="absolute right-5 top-5 z-10 sm:right-8 lg:right-10">{corner}</div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border/60">
          <Icon className="size-5" aria-hidden />
        </span>
        <h1 className="font-heading text-[1.65rem] leading-tight tracking-tight sm:text-[1.85rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4 max-w-md">{children}</div> : null}
        {showCta ? (
          <div className="mt-6">
            {ctaHref ? (
              <Button
                className={cn('uma-cta-primary', ctaClassName)}
                nativeButton={false}
                render={<Link href={ctaHref} />}
              >
                {ctaLabel}
              </Button>
            ) : (
              <Button className={cn('uma-cta-primary', ctaClassName)} onClick={onCtaClick}>
                {ctaLabel}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
