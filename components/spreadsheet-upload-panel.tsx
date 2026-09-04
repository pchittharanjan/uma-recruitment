import { cn } from '@/lib/utils';
import { PagePanel } from '@/components/page-shell';

/**
 * Shared shell for spreadsheet intake UIs (application CSV + coffee-chat form export).
 * Keeps section title, description, and inset panel styling in the same family.
 */
export function SpreadsheetUploadPanel({
  title,
  description,
  children,
  className,
  'data-tour': dataTour,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  'data-tour'?: string;
}) {
  return (
    <PagePanel className={cn('space-y-4', className)} data-tour={dataTour}>
      <div className="space-y-1.5">
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </PagePanel>
  );
}
