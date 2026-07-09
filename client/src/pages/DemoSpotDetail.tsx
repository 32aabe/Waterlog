import { useParams, useLocation } from "wouter";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { getDemoSpotById } from "@/lib/demoSpots";
import { getSpotTypeLabel } from "@/const";
import { resolveWaterStateStyle } from "@/lib/spotVisual";
import { ArrowLeft, Plus } from "lucide-react";

/**
 * The Spot screen's local-only stand-in for a demo marker (see
 * lib/demoSpots.ts, MapFallback.tsx) — a demo spot's id doesn't exist in
 * the real database, so the real SpotStory screen (which fetches
 * trpc.spots.getById) has nothing to show it. This route never touches
 * the network: everything it renders comes straight from the
 * AIR_DEMO_SPOTS constant, so it can't fail from a missing server, a
 * missing DB, or a bad id the way the real Spot screen could.
 */
export default function DemoSpotDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const spot = getDemoSpotById(Number(id));

  if (!spot) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">This demo spot couldn't be found.</p>
        <Button size="sm" onClick={() => navigate("/")}>
          Back to map
        </Button>
      </div>
    );
  }

  const style = resolveWaterStateStyle(spot);
  const knownFor = formatDistanceToNowStrict(spot.firstSeenAt);
  const lastActivity = formatDistanceToNow(spot.lastActivityAt, { addSuffix: true });

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2">
        <button
          type="button"
          aria-label="Back to map"
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-lg text-foreground">{spot.name}</h1>
      </header>

      <div className="mx-4 mt-2 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: style.color }} />
          <span className="text-xs font-medium text-muted-foreground">{style.label}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{spot.placeName}</p>
        <p className="mt-3 text-sm text-foreground/90">{spot.blurb}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Known for {knownFor} · last checked {lastActivity}
        </p>
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Part of the AIR demo dataset for Brooklyn Bridge Park and Pace — a sample {getSpotTypeLabel(spot.spotType).toLowerCase()},
          not a live record.
        </p>
      </div>

      <div className="mx-4 mt-4">
        <Button className="w-full" onClick={() => navigate("/capture")}>
          <Plus className="h-4 w-4" /> Log a moment nearby
        </Button>
      </div>
    </div>
  );
}
