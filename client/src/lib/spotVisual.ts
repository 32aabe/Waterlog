import type { SpotSummary } from "../../../server/db";
import type { LifecycleState } from "@/const";

// A spot's relationship depth: not a score, never shown as a number, and
// deliberately blended from two slow-moving signals rather than visit
// count alone (docs/design/01_MAP_SCREEN.md, "the exact algorithm should
// remain intentionally invisible"). Saturates gently so a handful of
// visits or a couple of months already reads as "known," rather than
// requiring dozens before the mark visibly settles. Shared by the real
// map's markers and the local fallback landscape so both render spots
// identically.
export function relationshipDepth(spot: SpotSummary): number {
  const daysKnown = (Date.now() - new Date(spot.firstSeenAt).getTime()) / 86_400_000;
  const momentDepth = 1 - 1 / (1 + spot.momentCount / 4);
  const timeDepth = 1 - 1 / (1 + daysKnown / 45);
  return Math.min(1, (momentDepth + timeDepth) / 2);
}

// Cool and faint at first, passing through the app's own rich water-blue
// as the mark "becomes richer," settling warm only at real depth — a
// color-mix expression over CSS variables (not hardcoded hex) so it
// follows the light/dark theme automatically.
export function depthColorExpr(depth: number): string {
  if (depth < 0.5) {
    const t = Math.round((depth / 0.5) * 100);
    return `color-mix(in oklab, var(--water-deep) ${t}%, var(--water-soft) ${100 - t}%)`;
  }
  const t = Math.round(((depth - 0.5) / 0.5) * 100);
  return `color-mix(in oklab, var(--warm) ${t}%, var(--water-deep) ${100 - t}%)`;
}

// A spot coming back from dry is warm regardless of how young the
// relationship is — the moment itself is tender, not something that has
// to be earned by accumulated depth.
export function markColor(spot: SpotSummary, depth: number): string {
  return spot.lifecycleState === "reawakened" ? depthColorExpr(Math.max(depth, 0.85)) : depthColorExpr(depth);
}

// Presence fades like a real dry streambed rather than switching off —
// quieter, not hidden (docs/04_DESIGN_MANIFESTO.md §6).
export function markPresence(spot: SpotSummary): number {
  return spot.lifecycleState === "dry" ? 0.5 : spot.lifecycleState === "drying" ? 0.78 : 1;
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

// Motion is still rationed like warmth: only a spot coming back from dry
// gets the looping ripple. Depth alone never animates.
export const PULSING_LIFECYCLE_STATES = new Set(["reawakened"]);

// A quiet, muted color per lifecycle state — never the saturated
// traffic-light red/yellow/green a status dot usually implies. Same
// color-mix-over-CSS-variable idiom as depthColorExpr above, so light/
// dark both stay correct automatically. Warmth fades further as a spot
// dries out (drying → dry), echoing markPresence's "fades like a real
// dry streambed" metaphor above. alive/dry/reawakened are deliberately
// spread across both brightness and hue (light cool teal → warm brown →
// dark blue) rather than three shades of the same muted grey-teal, which
// read as too similar at the ~6px size these render at in practice.
export const LIFECYCLE_DOT_COLOR: Record<LifecycleState, string> = {
  alive: "color-mix(in oklab, var(--water-soft) 65%, white 35%)",
  drying: "color-mix(in oklab, var(--warm) 70%, var(--muted-foreground) 30%)",
  dry: "color-mix(in oklab, var(--warm) 62%, var(--muted-foreground) 38%)",
  reawakened: "color-mix(in oklab, var(--water-deep) 85%, var(--water) 15%)",
};
