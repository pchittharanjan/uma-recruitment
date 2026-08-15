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

const containerPadding =
  'w-full px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-9 xl:px-12 2xl:px-14';

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

/** Raised section surface — soft border, no heavy shadow. */
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
        'uma-inset-surface rounded-xl px-5 py-5 sm:px-7 sm:py-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 pb-1 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="uma-section-label mb-2">{eyebrow}</p>
        )}
        <h1
          className={cn(
            'font-heading text-[1.65rem] leading-tight tracking-tight sm:text-[1.85rem]',
            eyebrow && 'mt-0',
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const PageSection = forwardRef<
  HTMLElement,
  { children: React.ReactNode; className?: string }
>(function PageSection({ children, className }, ref) {
  return (
    <section ref={ref} className={cn('space-y-6', className)}>
      {children}
    </section>
  );
});

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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
