const FALLBACK_ISO = '2026-08-17T00:00:00.000Z';

export function formatLastUpdated(iso = process.env.NEXT_PUBLIC_LAST_UPDATED): string {
  const date = new Date(iso || FALLBACK_ISO);
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(FALLBACK_ISO));
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
