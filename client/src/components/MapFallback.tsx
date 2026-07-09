import { LocateFixed } from "lucide-react";
import { spawnRipple } from "@/lib/ripple";
import { markColor, markCoreColor, markPresence, relationshipDepth, rippleMarkMetrics, PULSING_WATER_STATES } from "@/lib/spotVisual";
import { distanceMeters } from "@/lib/geo";
import type { SpotSummary } from "../../../server/db";

type LatLng = { lat: number; lng: number };
type LayoutPoint = { key: string; lat: number; lng: number };

// Points closer than this are treated as "the same neighborhood" for
// layout purposes — a similar scale to Capture's own nearby-spot
// suggestion radius (see SUGGEST_RADIUS_M in pages/Capture.tsx), just
// for grouping marks visually rather than matching a moment to a spot.
const CLUSTER_RADIUS_M = 300;

// Groups points into clusters by real-world proximity (greedy, single
// pass; a cluster's centroid updates as members join). Each cluster is
// then laid out as one independent unit on screen (see
// normalizePositions below) — so a single geographically distant point
// can never distort how an entire local cluster is laid out relative to
// itself, and a tight local cluster's layout never depends on how far
// away anything else happens to be.
function clusterPoints(points: LayoutPoint[], radiusM: number): { lat: number; lng: number; members: LayoutPoint[] }[] {
  const clusters: { lat: number; lng: number; members: LayoutPoint[] }[] = [];
  for (const p of points) {
    const target = clusters.find(c => distanceMeters({ lat: p.lat, lng: p.lng }, { lat: c.lat, lng: c.lng }) <= radiusM);
    if (target) {
      target.members.push(p);
      target.lat = target.members.reduce((sum, m) => sum + m.lat, 0) / target.members.length;
      target.lng = target.members.reduce((sum, m) => sum + m.lng, 0) / target.members.length;
    } else {
      clusters.push({ lat: p.lat, lng: p.lng, members: [p] });
    }
  }
  return clusters;
}

// A golden-angle spiral so members of the same cluster fan out into a
// small rosette rather than stacking exactly on top of one another —
// deterministic, no randomness needed, and separation only ever grows as
// more members join (never simply "bigger," see docs/design/
// 01_MAP_SCREEN.md).
const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);

function spiralOffset(index: number, count: number, maxRadiusPct: number): { dx: number; dy: number } {
  if (count <= 1) return { dx: 0, dy: 0 };
  const angle = index * GOLDEN_ANGLE;
  const radius = maxRadiusPct * Math.sqrt(index / (count - 1));
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
}

// Lays out every spot (and the user, if located) as independent
// clusters arranged in a grid — cluster count and rough geographic order
// (north/south via rows, west/east via columns) determine placement,
// never literal distance between points, so one distant outlier can
// never compress everything else toward a single pixel. Within a
// cluster, members spiral outward from its own cell center. Replaces a
// previous single global bounding-box projection, which collapsed the
// whole demo cluster to one point the moment any one spot existed far
// away — reproduced by creating a spot in Seoul next to the seeded San
// Francisco cluster. Still not a real projection — there are no tiles
// here — just enough geometry that every Spot stays independently
// discoverable regardless of how a user's real-world captures happen to
// be scattered.
function normalizePositions(spots: SpotSummary[], userCoords: LatLng | null) {
  const points: LayoutPoint[] = spots.map(s => ({
    key: `spot-${s.id}`,
    lat: Number(s.latitude),
    lng: Number(s.longitude),
  }));
  if (userCoords) points.push({ key: "user", lat: userCoords.lat, lng: userCoords.lng });

  if (points.length === 0) {
    return { forSpot: () => ({ x: 50, y: 50 }), user: null as { x: number; y: number } | null };
  }

  const clusters = clusterPoints(points, CLUSTER_RADIUS_M);

  const cols = Math.max(1, Math.ceil(Math.sqrt(clusters.length)));
  const rows = Math.max(1, Math.ceil(clusters.length / cols));
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  // Capped to a fraction of the smaller cell dimension so even a
  // crowded cluster never spills into its neighbor's cell.
  const maxSpiralRadius = Math.min(cellW, cellH) * 0.32;

  // North (higher latitude) reads as "up," the same convention as the
  // real map — bucketed into rows, then each row sorted west-to-east
  // into columns. Approximate, not a literal projection: only relative
  // order matters, never actual distance, which is exactly what makes
  // this robust to an arbitrarily distant outlier.
  const byLatDesc = [...clusters].sort((a, b) => b.lat - a.lat);
  const positions = new Map<string, { x: number; y: number }>();

  for (let row = 0; row < rows; row++) {
    const rowClusters = byLatDesc.slice(row * cols, (row + 1) * cols).sort((a, b) => a.lng - b.lng);
    rowClusters.forEach((cluster, col) => {
      const cx = cellW * (col + 0.5);
      const cy = cellH * (row + 0.5);
      cluster.members.forEach((member, mi) => {
        const { dx, dy } = spiralOffset(mi, cluster.members.length, maxSpiralRadius);
        positions.set(member.key, { x: cx + dx, y: cy + dy });
      });
    });
  }

  return {
    forSpot: (s: SpotSummary) => positions.get(`spot-${s.id}`) ?? { x: 50, y: 50 },
    user: userCoords ? (positions.get("user") ?? null) : null,
  };
}

/**
 * The relationship landscape when real map tiles can't load (no Google
 * Maps API key, or a network failure) — never a blank panel. Same
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
        const color = markColor(spot);
        const coreColor = markCoreColor(spot);
        const presence = markPresence(spot);
        const pos = forSpot(spot);
        const pulsing = PULSING_WATER_STATES.has(spot.waterState);

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
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/85"
              style={{ width: coreSize, height: coreSize, background: coreColor, boxShadow: `0 0 ${glowBlur}px ${glowSpread}px ${color}, 0 1px 3px rgba(33, 47, 48, 0.3)` }}
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
