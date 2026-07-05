import { LocateFixed } from "lucide-react";
import { spawnRipple } from "@/lib/ripple";
import { markColor, markPresence, relationshipDepth, rippleMarkMetrics, PULSING_LIFECYCLE_STATES } from "@/lib/spotVisual";
import type { SpotSummary } from "../../../server/db";

type LatLng = { lat: number; lng: number };

// Turns real lat/lng into a 0–100% position within this panel by
// normalizing against the bounding box of every point being shown (all
// spots plus, if available, the user). Not a real projection — there are
// no tiles here — just enough geometry that a user's own spots keep
// their relative layout to each other when real map tiles can't load.
function normalizePositions(spots: SpotSummary[], userCoords: LatLng | null) {
  const points: LatLng[] = spots.map(s => ({ lat: Number(s.latitude), lng: Number(s.longitude) }));
  if (userCoords) points.push(userCoords);

  if (points.length === 0) {
    return { forSpot: () => ({ x: 50, y: 50 }), user: null as { x: number; y: number } | null };
  }

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);

  // Padding so a single spot (or a tight cluster) doesn't sit at a
  // degenerate zero-width box, and nothing renders flush against an edge.
  const latPad = Math.max((maxLat - minLat) * 0.3, 0.006);
  const lngPad = Math.max((maxLng - minLng) * 0.3, 0.006);
  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;

  const toPct = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    // Latitude increases northward, which is "up" — smaller y in screen space.
    y: (1 - (lat - minLat) / (maxLat - minLat)) * 100,
  });

  return {
    forSpot: (s: SpotSummary) => toPct(Number(s.latitude), Number(s.longitude)),
    user: userCoords ? toPct(userCoords.lat, userCoords.lng) : null,
  };
}

/**
 * The relationship landscape when real map tiles can't load (no Forge
 * Maps credentials, or a network failure) — never a blank panel. Same
 * ripple marks as the real map (see lib/spotVisual.ts), laid out over a
 * soft gradient wash with a quiet suggestion of water winding through it,
 * rather than literal tiles.
 */
export function MapFallback({
  spots,
  userCoords,
  onSelect,
  onLocate,
}: {
  spots: SpotSummary[];
  userCoords: LatLng | null;
  onSelect: (spot: SpotSummary) => void;
  onLocate: () => void;
}) {
  const { forSpot, user } = normalizePositions(spots, userCoords);

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-[var(--water-mist-2)] via-[var(--paper)] to-[var(--water-mist)]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M -10 68 Q 20 52, 42 66 T 90 58 T 130 72" stroke="var(--water-soft)" strokeWidth="2.5" fill="none" opacity="0.45" />
        <path d="M -10 38 Q 32 28, 55 40 T 130 33" stroke="var(--water-soft)" strokeWidth="1.5" fill="none" opacity="0.28" />
      </svg>

      {spots.map(spot => {
        const depth = relationshipDepth(spot);
        const { haloSize, coreSize, glowBlur, glowSpread } = rippleMarkMetrics(depth);
        const color = markColor(spot, depth);
        const presence = markPresence(spot);
        const pos = forSpot(spot);
        const pulsing = PULSING_LIFECYCLE_STATES.has(spot.lifecycleState);

        return (
          <button
            key={spot.id}
            type="button"
            aria-label={spot.name ?? "Water spot"}
            onClick={e => {
              onSelect(spot);
              spawnRipple(e.currentTarget, color);
            }}
            className={pulsing ? "map-pulse absolute -translate-x-1/2 -translate-y-1/2" : "absolute -translate-x-1/2 -translate-y-1/2"}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: haloSize, height: haloSize, opacity: presence, color }}
          >
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: coreSize, height: coreSize, background: color, boxShadow: `0 0 ${glowBlur}px ${glowSpread}px ${color}` }}
            />
          </button>
        );
      })}

      {user && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-foreground/70 shadow"
          style={{ left: `${user.x}%`, top: `${user.y}%`, width: 10, height: 10 }}
        />
      )}

      <button
        type="button"
        aria-label="Find my location"
        onClick={onLocate}
        className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow"
      >
        <LocateFixed className="h-4 w-4" />
      </button>
    </div>
  );
}
