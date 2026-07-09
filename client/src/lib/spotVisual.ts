import type { SpotSummary, WaterState } from "../../../server/db";

// server/db.ts's deriveSpotWaterState still computes all 8 detailed
// states (alive/flowing/full/shallow/after_rain/dry/frozen/unknown) — that
// stays exactly as-is, and spot.waterState still carries the detailed
// value. This is a *display* simplification layered on top of it: the
// demo's visible UI (badges, marker color, illustration accent) only ever
// shows one of these four categories, never the finer-grained state.
// Deliberately collapses the 5 "there's water and things are basically
// fine" states into one — Full/Shallow/Flowing/After Rain reads as too
// granular a distinction for a glance at a badge or a marker dot.
export type DisplayWaterState = "alive" | "dry" | "frozen" | "unknown";

const DISPLAY_STATE_BY_WATER_STATE: Record<WaterState, DisplayWaterState> = {
  alive: "alive",
  flowing: "alive",
  full: "alive",
  shallow: "alive",
  after_rain: "alive",
  dry: "dry",
  frozen: "frozen",
  unknown: "unknown",
};

// The demo's only visible water-state palette — the sole place a Spot's
// color is defined, for the map marker, the Spot page badge, the
// illustration, and any future UI alike. presence still varies by
// category, echoing the app's original "fades like a real dry streambed"
// metaphor: a place that's genuinely dry, or whose condition isn't known,
// reads quieter — Alive and Frozen both stay close to full opacity, so
// nothing fades just because a Spot is new or hasn't accumulated
// relationship depth yet.
export const DISPLAY_STATE_STYLE: Record<DisplayWaterState, { color: string; label: string; presence: number }> = {
  alive: { color: "#4DA3FF", label: "Alive", presence: 1 },
  dry: { color: "#B89B6D", label: "Dry", presence: 0.55 },
  // Deliberately a darker, more saturated steel blue than a first pass
  // (#C7D7E5) — that read as pale gray, easy to miss against the map's
  // own muted tiles and against a light badge background. Still cool/
  // desaturated relative to Alive's brighter sky blue (so the two don't
  // read as the same color), just no longer washed out.
  frozen: { color: "#4F7C99", label: "Frozen", presence: 0.95 },
  unknown: { color: "#9AA7B2", label: "Unknown", presence: 0.7 },
};

// A spot's relationship depth: not a score, never shown as a number, and
// deliberately blended from two slow-moving signals rather than visit
// count alone (docs/design/01_MAP_SCREEN.md, "the exact algorithm should
// remain intentionally invisible"). Saturates gently so a handful of
// visits or a couple of months already reads as "known," rather than
// requiring dozens before the mark visibly settles. Purely a richness
// signal — halo/glow size and ripple count (see rippleMarkMetrics below)
// — never color; color is water state alone (DISPLAY_STATE_STYLE above),
// so the two axes ("what's happening here right now" vs. "how well do I
// know this place") can never collapse back into one.
export function relationshipDepth(spot: SpotSummary): number {
  const daysKnown = (Date.now() - new Date(spot.firstSeenAt).getTime()) / 86_400_000;
  const momentDepth = 1 - 1 / (1 + spot.momentCount / 4);
  const timeDepth = 1 - 1 / (1 + daysKnown / 45);
  return Math.min(1, (momentDepth + timeDepth) / 2);
}

// Guards against a spot whose waterState isn't a recognized key — a stale
// cached spots.list response fetched before this field existed, or any
// future value drift — falling back to "unknown" rather than throwing.
// This isn't defensive-programming theater: an unguarded lookup previously
// threw inside a plain spots.forEach() in MapHome/MapFallback, which
// aborts the whole loop on the first bad spot (every marker after it in
// iteration order silently never gets created) and, since the throw
// happens inside a passive effect, crashes the entire <MapHome> tree hard
// enough for the top-level ErrorBoundary to tear it down and remount from
// scratch — "one spot with bad data" became "the whole map is blank."
// Logged, not silent, since a spot actually hitting this fallback means
// something upstream served data this pipeline doesn't recognize.
export function resolveWaterStateStyle(spot: SpotSummary) {
  const displayState = DISPLAY_STATE_BY_WATER_STATE[spot.waterState];
  if (!displayState) {
    console.warn(`[spotVisual] Spot ${spot.id} ("${spot.name ?? "unnamed"}") has an unrecognized waterState (${JSON.stringify(spot.waterState)}) — falling back to "unknown". Likely a stale cached spots.list response; a hard refresh should clear it.`);
    return DISPLAY_STATE_STYLE.unknown;
  }
  return DISPLAY_STATE_STYLE[displayState];
}

export function markColor(spot: SpotSummary): string {
  return resolveWaterStateStyle(spot).color;
}

// A touch lighter than markColor, for the marker's small solid core only
// — the surrounding glow stays the base state color, so the mark reads as
// brightest at the center and quieter toward its soft edge, rather than a
// single flat-toned disc. Mixed toward white, not toward a more saturated
// version of the color, so brightening the center never tips into neon.
export function markCoreColor(spot: SpotSummary): string {
  return `color-mix(in oklab, white 14%, ${markColor(spot)} 86%)`;
}

export function markPresence(spot: SpotSummary): number {
  return resolveWaterStateStyle(spot).presence;
}

export type RippleMarkMetrics = { haloSize: number; coreSize: number; glowBlur: number; glowSpread: number };

// A soft watercolor mark rather than a pin: a small solid core wrapped in
// a much larger, softer glow that grows and blurs as the relationship
// deepens — "the mark becomes richer, edges become softer," never simply
// bigger (see docs/design/01_MAP_SCREEN.md).
export function rippleMarkMetrics(depth: number): RippleMarkMetrics {
  return {
    haloSize: Math.round(22 + depth * 16),
    coreSize: Math.round(7 + depth * 5),
    glowBlur: Math.round(6 + depth * 10),
    glowSpread: Math.round(2 + depth * 4),
  };
}

// Motion stays rationed: only a spot whose water state just read as
// "after rain" (freshly back from dry) gets the looping ripple, regardless
// of relationship depth — depth alone never animates.
export const PULSING_WATER_STATES = new Set<WaterState>(["after_rain"]);
