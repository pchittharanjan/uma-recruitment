import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

type ContainerSize = 'default' | 'narrow' | 'wide' | 'full';

/** Standard page widths — default is wide enough for dashboards and tables. */
const containerSizes: Record<ContainerSize, string> = {
  default: 'max-w-[96rem]',
  narrow: 'max-w-3xl',
  wide: 'max-w-[120rem]',
  full: 'max-w-none',
};

/** Horizontal page padding — one source of truth in `.uma-page-pad-x`. */
export const pagePaddingX = 'uma-page-pad-x';

const containerPadding =
  `uma-page-root w-full min-w-0 ${pagePaddingX} py-7 sm:py-9 lg:py-9`;

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative min-h-screen bg-background', className)}>{children}</div>
  );
}

export function PageContainer({
  children,
  className,
  size = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  size?: ContainerSize;
}) {
  return (
    <div
      className={cn(
        'relative mx-auto',
        containerPadding,
        containerSizes[size],
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Inner width constraint for reading-heavy views (essays, forms).
 * Use inside a wide PageContainer when full bleed isn't ideal.
 */
export function PageContent({
  children,
  className,
  width = 'comfortable',
}: {
  children: React.ReactNode;
  className?: string;
  width?: 'narrow' | 'comfortable' | 'wide' | 'fluid';
}) {
  const widths = {
    narrow: 'mx-auto w-full max-w-2xl',
    comfortable: 'mx-auto w-full max-w-4xl',
    wide: 'mx-auto w-full max-w-5xl',
    fluid: 'w-full max-w-none',
  };
  return <div className={cn(widths[width], className)}>{children}</div>;
}

/** Soft inset section surface — tone shift only, no outline. */
export function PagePanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'uma-inset-surface uma-pane-pad rounded-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Scrollable action row — use under PageHeader for many nav links or toolbars. */
export function PageToolbar({
  children,
  className,
  wrap = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Allow wrapping on very narrow screens; default keeps a single scroll row. */
  wrap?: boolean;
}) {
  return (
    <div className={cn('uma-scroll-strip w-full', className)}>
      <div
        className={cn(
          'uma-scroll-strip-inner',
          wrap ? 'flex-wrap' : 'flex-nowrap',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Full-width row below the title — ideal for phase links and secondary nav. */
  toolbar?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 pb-1', className)}>
      {eyebrow ? <p className="uma-section-label">{eyebrow}</p> : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1
          className={cn(
            'min-w-0 font-heading text-[1.65rem] leading-tight tracking-tight sm:text-[1.85rem]',
          )}
        >
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {description ? (
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {toolbar ? <PageToolbar>{toolbar}</PageToolbar> : null}
    </div>
  );
}

export const PageSection = forwardRef<
  HTMLElement,
  { children: React.ReactNode; className?: string }
>(function PageSection({ children, className }, ref) {
  return (
    <section ref={ref} className={cn('uma-page-root uma-stack-page min-w-0', className)}>
      {children}
    </section>
  );
});

/** Quiet count beside a title — use instead of “(12)” in headings and labels. */
export function TitleCount({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('text-sm font-normal tabular-nums text-muted-foreground', className)}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-heading text-xs text-muted-foreground">{label}</p>
      <p className="font-heading mt-1 text-2xl font-medium tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
