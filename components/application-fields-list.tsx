import { ResponseText } from '@/components/response-text';
import { prepareApplicationFieldsForDisplay } from '@/lib/application-fields-display';
import { restAfterFirstUrl } from '@/lib/link-preview';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function ApplicationFieldValue({ value }: { value: string }) {
  if (!value.trim()) {
    return <span className="text-muted-foreground">-</span>;
  }

  const trimmed = value.trim();
  if (isHttpUrl(trimmed) && !restAfterFirstUrl(trimmed)) {
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary underline-offset-2 hover:underline"
      >
        {trimmed}
      </a>
    );
  }

  return (
    <span className="break-words whitespace-pre-wrap text-foreground">
      <ResponseText text={value} />
    </span>
  );
}

export function ApplicationFieldsList({
  fields,
  className,
}: {
  fields: Record<string, string>;
  className?: string;
  /** Accepted for callers that still pass it; Open in Drive is always shown. */
  blind?: boolean;
}) {
  const entries = prepareApplicationFieldsForDisplay(fields);

  return (
    <div className={className ?? 'space-y-3'}>
      {entries.map(({ key, value }) => (
        <div
          key={key}
          className="display-panel min-w-0 p-4"
        >
          <p className="min-w-0 break-words text-sm font-semibold text-foreground/80">
            {key}
          </p>
          <div className="mt-2 min-w-0 text-base text-foreground">
            <ApplicationFieldValue value={value} />
          </div>
        </div>
      ))}
    </div>
  );
}
