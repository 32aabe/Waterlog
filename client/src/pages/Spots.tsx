import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getSpotTypeLabel, LIFECYCLE_LABELS } from "@/const";
import { LIFECYCLE_DOT_COLOR } from "@/lib/spotVisual";
import { Search, MapPinned } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const FILTERS = ["all", "alive", "drying", "dry", "reawakened"] as const;

export default function Spots() {
  const [, navigate] = useLocation();
  const { data: spots, isLoading } = trpc.spots.list.useQuery();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const filtered = useMemo(() => {
    if (!spots) return [];
    return spots.filter(spot => {
      if (filter !== "all" && spot.lifecycleState !== filter) return false;
      if (!query) return true;
      const haystack = `${spot.name ?? ""} ${spot.placeName ?? ""} ${getSpotTypeLabel(spot.spotType)}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [spots, query, filter]);

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
          <MapPinned className="h-5 w-5 text-primary" /> Spots
        </h1>
        <p className="text-xs text-muted-foreground">Every spot you've found, all in one place.</p>
      </header>

      <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search spots"
          className="h-auto border-0 p-0 shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="mx-4 mb-4 flex gap-1.5 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex-shrink-0 rounded-full border px-3 py-1 text-xs capitalize",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
            )}
          >
            {f === "all" ? "All" : LIFECYCLE_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="mx-4 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No spots match.</p>
        )}
        {filtered.map(spot => (
          <button
            key={spot.id}
            onClick={() => navigate(`/spot/${spot.id}`)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-accent"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {spot.name || getSpotTypeLabel(spot.spotType)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {getSpotTypeLabel(spot.spotType)} · active {formatDistanceToNow(new Date(spot.lastActivityAt), { addSuffix: true })}
              </p>
            </div>
            <Badge variant="secondary" className="flex-shrink-0">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: LIFECYCLE_DOT_COLOR[spot.lifecycleState] }}
              />
              {LIFECYCLE_LABELS[spot.lifecycleState]}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
