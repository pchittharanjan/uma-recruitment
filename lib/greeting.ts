/** Morning before noon, afternoon until 6pm, evening after. Uses local time when `date` is omitted. */
export function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

/** "Good Morning, Pranav" — or time-only greeting when name is missing. */
export function greetingForName(name?: string | null, date = new Date()): string {
  const greeting = timeOfDayGreeting(date);
  const trimmed = name?.trim();
  if (!trimmed) return greeting;
  const first = trimmed.split(/\s+/)[0];
  return first ? `${greeting}, ${first}` : greeting;
}
