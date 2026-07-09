// Pure, symbolic mapping from a Spot's real attributes (type, water
// condition, bird activity, relationship depth/lifecycle — see
// server/db.ts and lib/spotVisual.ts) to the shape/fill/mark parameters
// the Place Portrait illustration is built from. Never a photo, never a
// literal species or count — see docs/design/06_SPOT_SCREEN.md,
// "Illustration Philosophy."

export type WaterShapeFamily =
  | "organic-small"
  | "organic-medium"
  | "oval-large"
  | "circle-basin"
  | "channel"
  | "cluster"
  | "rounded-rect";

const SHAPE_BY_TYPE: Record<string, WaterShapeFamily> = {
  puddle: "organic-small",
  temporary_pool: "organic-medium",
  pond: "oval-large",
  fountain: "circle-basin",
  drainage: "channel",
  container: "rounded-rect",
  wetland: "cluster",
  other: "organic-small",
};

export function shapeFamilyForSpotType(spotType: string): WaterShapeFamily {
  return SHAPE_BY_TYPE[spotType] ?? "organic-small";
}

export type ConditionTreatment = "full" | "partial" | "dry" | "frozen" | "partially_frozen" | "snow";

const CONDITION_TREATMENT: Record<string, ConditionTreatment> = {
  full: "full",
  receding: "partial",
  puddle_only: "partial",
  dry: "dry",
  frozen: "frozen",
  partially_frozen: "partially_frozen",
  snow_ice_present: "snow",
  // An honest "some water, unspecified" rather than silently implying
  // confidence via the "full" fallback below.
  other: "partial",
};

// No moment logged yet reads as the ordinary case, not an empty one — a
// brand-new spot shouldn't look broken before its first check-in.
export function conditionTreatment(waterCondition: string | null | undefined): ConditionTreatment {
  if (!waterCondition) return "full";
  return CONDITION_TREATMENT[waterCondition] ?? "full";
}

export type BirdMarkPlacement = { x: number; y: number };

type ActivityLevel = "None" | "Low" | "Medium" | "High";

const ACTIVITY_MARK_COUNT: Record<ActivityLevel, number> = {
  None: 0,
  Low: 1,
  Medium: 3,
  High: 5,
};

// A tiny seeded PRNG (Park-Miller) keyed on the spot's own id —
// deterministic so bird marks don't jump around between renders or
// sessions, without every spot's marks landing in identical positions.
function seededOffsets(seed: number, count: number): BirdMarkPlacement[] {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const placements: BirdMarkPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const angle = next() * Math.PI * 2;
    const radius = 45 + next() * 35;
    placements.push({
      x: 100 + Math.cos(angle) * radius,
      y: 38 + next() * 20, // birds sit above the waterline, not on the water
    });
  }
  return placements;
}

export function birdMarkPlacements(spotId: number, activityLevel: ActivityLevel): BirdMarkPlacement[] {
  return seededOffsets(spotId, ACTIVITY_MARK_COUNT[activityLevel]);
}

// Depth-driven glow for the illustration canvas (viewBox units, not
// pixels) — mirrors rippleMarkMetrics' "richer, softer as depth grows"
// shape (lib/spotVisual.ts) but scaled for a large portrait rather than
// a small map marker; those pixel constants were tuned for a ~30px mark.
export function illustrationGlow(depth: number): { blur: number; opacity: number } {
  return {
    blur: 6 + depth * 14,
    opacity: 0.25 + depth * 0.35,
  };
}
