function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function ApplicationFieldValue({ value }: { value: string }) {
  if (!value.trim()) {
    return <span className="text-muted-foreground">—</span>;
  }

  const trimmed = value.trim();
  if (isHttpUrl(trimmed)) {
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

  return <span className="break-words whitespace-pre-wrap text-foreground">{value}</span>;
}

export function ApplicationFieldsList({
  fields,
  className,
}: {
  fields: Record<string, string>;
  className?: string;
}) {
  return (
    <div className={className ?? 'space-y-3'}>
      {Object.entries(fields).map(([key, value]) => (
        <div
          key={key}
          className="min-w-0 rounded-md border border-border bg-card px-3 py-3 shadow-sm sm:px-4"
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
