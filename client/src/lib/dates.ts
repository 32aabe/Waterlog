/** "Today" / "Yesterday" / weekday / full date — a diary reads by day, not by ISO timestamp. */
export function dayHeaderLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  // "en-US" pinned explicitly rather than left to the runtime's default
  // locale — this app's demo copy is English-only throughout, and an
  // unpinned locale silently renders this in whatever the OS/browser is
  // set to (surfaced as Korean day headers during design review).
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(
    "en-US",
    sameYear ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" },
  );
}

/** "Mar 3, 2026" — a plain, quiet date for "Since ..." lines. Always en-US, same reasoning as dayHeaderLabel above. */
export function shortDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Groups already newest-first items into day buckets, preserving order. */
export function groupByDay<T extends { capturedAt: string | Date }>(
  items: T[],
): Array<{ key: string; date: Date; items: T[] }> {
  const groups = new Map<string, { date: Date; items: T[] }>();
  const order: string[] = [];

  for (const item of items) {
    const d = new Date(item.capturedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let group = groups.get(key);
    if (!group) {
      group = { date: d, items: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.items.push(item);
  }

  return order.map(key => ({ key, ...groups.get(key)! }));
}

/**
 * The most recent moment captured on this same month/day in a prior year
 * — the seed of "on this day" memory browsing. Returns null gracefully
 * when there's no history yet, which is the common case for a new
 * account; the callout that uses this should simply not render then.
 */
export function findOnThisDay<T extends { capturedAt: string | Date }>(items: T[]): T | null {
  const now = new Date();
  return (
    items.find(item => {
      const d = new Date(item.capturedAt);
      return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() !== now.getFullYear();
    }) ?? null
  );
}
