import { cn } from "@/lib/utils";

export type ActivitySparklineProps = {
  /** One count per period, oldest first, current period last. */
  counts: number[];
  className?: string;
};

/**
 * A minimal trend figure for a stat tile: recent weeks in the
 * de-emphasis hue, the current week in the accent, per the stat-tile
 * "trend" contract. Single series, so no legend — the label above it
 * already says what's plotted. A sliver baseline keeps zero-count weeks
 * (the common case for a brand-new spot or account) visible as "no
 * activity yet" rather than invisible.
 */
export function ActivitySparkline({ counts, className }: ActivitySparklineProps) {
  const max = Math.max(1, ...counts);

  return (
    <div className={cn("flex h-10 items-end gap-[2px]", className)} role="img" aria-label={`Activity over the last ${counts.length} weeks`}>
      {counts.map((count, i) => {
        const isCurrent = i === counts.length - 1;
        const heightPct = Math.max((count / max) * 100, count > 0 ? 12 : 6);
        return (
          <div
            key={i}
            className={cn("flex-1 rounded-t-sm", isCurrent ? "bg-primary" : "bg-chart-1")}
            style={{ height: `${heightPct}%` }}
            title={count > 0 ? `${count} moment${count === 1 ? "" : "s"}` : undefined}
          />
        );
      })}
    </div>
  );
}
