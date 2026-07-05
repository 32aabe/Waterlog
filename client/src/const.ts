export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_NAME = "Waterlog";
export const APP_TAGLINE = "A field journal for water and the birds who find it.";

export const SPOT_TYPES = [
  "puddle",
  "temporary_pool",
  "pond",
  "fountain",
  "drainage",
  "container",
  "wetland",
  "other",
] as const;
export type SpotType = (typeof SPOT_TYPES)[number];

export const SPOT_TYPE_LABELS: Record<SpotType, string> = {
  puddle: "Puddle",
  temporary_pool: "Temporary pool",
  pond: "Pond",
  fountain: "Fountain",
  drainage: "Drainage channel",
  container: "Container",
  wetland: "Wetland",
  other: "Water spot",
};

// spotType comes from the free-text `waterResourceType` column (see
// server/db.ts) rather than an enum, so it may not match a known label.
export function getSpotTypeLabel(spotType: string): string {
  return SPOT_TYPE_LABELS[spotType as SpotType] ?? spotType;
}

export const LIFECYCLE_STATES = ["alive", "drying", "dry", "reawakened"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleState, string> = {
  alive: "Alive",
  drying: "Drying",
  dry: "Dry",
  reawakened: "Reawakened",
};

// Water condition = the spot's current state (how much water, or ice,
// is there right now) — distinct from spot type, which is what kind of
// place it is (see SPOT_TYPE_LABELS above). Values stay in English in
// storage regardless of UI language; `label` is the only thing a future
// Korean UI would ever translate.
export const WATER_CONDITIONS = [
  { value: "full", label: "Full" },
  { value: "receding", label: "Receding" },
  { value: "puddle_only", label: "Puddle only" },
  { value: "dry", label: "Dry" },
  { value: "frozen", label: "Frozen" },
  { value: "partially_frozen", label: "Partially frozen" },
  { value: "snow_ice_present", label: "Snow/ice present" },
] as const;

// `waterCondition` on a moment is free-text in storage (see server/db.ts),
// same reasoning as getSpotTypeLabel above.
export function getWaterConditionLabel(waterCondition: string): string {
  return WATER_CONDITIONS.find(c => c.value === waterCondition)?.label ?? waterCondition.replace(/_/g, " ");
}

// {value, label} rather than plain strings, same reason as
// WATER_CONDITIONS above: `value` is what's stored (and stays fixed,
// English, comparable across app versions); `label` is the only part a
// future Korean UI would swap. Includes both "Resting" and "Perching" —
// Ver.2 treated them as distinct behaviors (grounded vs. perched), so
// keeping both preserves data consistency rather than guessing which one
// a past entry meant.
export const BEHAVIOR_OPTIONS = [
  { value: "Drinking", label: "Drinking" },
  { value: "Bathing", label: "Bathing" },
  { value: "Foraging", label: "Foraging" },
  { value: "Wading", label: "Wading" },
  { value: "Preening", label: "Preening" },
  { value: "Perching", label: "Perching" },
  { value: "Resting", label: "Resting" },
] as const;

// Infinitive form of each behavior, for prose that needs "stops to ___"
// rather than the gerund label used everywhere else (chips, filters) —
// a fixed, hand-mapped table since BEHAVIOR_OPTIONS is a closed set of
// seven values, not free text.
const BEHAVIOR_INFINITIVE: Record<string, string> = {
  Drinking: "drink",
  Bathing: "bathe",
  Foraging: "forage",
  Wading: "wade",
  Preening: "preen",
  Perching: "perch",
  Resting: "rest",
};
export function getBehaviorInfinitive(behavior: string): string {
  return BEHAVIOR_INFINITIVE[behavior] ?? behavior.toLowerCase();
}

// A starting point for species suggestions, not an exhaustive taxonomy —
// common birds likely to turn up at an urban or suburban water spot.
// Purely a client-side filter/suggestion aid: typing any other name is
// always allowed and stored exactly as typed.
export const COMMON_SPECIES = [
  "House Sparrow",
  "European Starling",
  "Rock Pigeon",
  "American Robin",
  "Mourning Dove",
  "American Crow",
  "Common Grackle",
  "Northern Cardinal",
  "Blue Jay",
  "Black-capped Chickadee",
  "House Finch",
  "American Goldfinch",
  "Dark-eyed Junco",
  "Song Sparrow",
  "Red-winged Blackbird",
  "Mallard",
  "Canada Goose",
  "American Coot",
  "Ring-billed Gull",
  "Herring Gull",
  "Great Blue Heron",
  "Great Egret",
  "Snowy Egret",
  "Double-crested Cormorant",
  "Belted Kingfisher",
  "Killdeer",
  "Spotted Sandpiper",
  "Wood Duck",
  "Bufflehead",
  "Pied-billed Grebe",
  "Red-tailed Hawk",
  "Cooper's Hawk",
  "Peregrine Falcon",
  "Barn Swallow",
  "Tree Swallow",
  "Chimney Swift",
  "Ruby-throated Hummingbird",
  "Downy Woodpecker",
  "Northern Flicker",
  "Carolina Wren",
  "Northern Mockingbird",
  "European Goldfinch",
  "Eurasian Collared-Dove",
  "Black-billed Magpie",
  "Common Moorhen",
  "Wood Stork",
  "White Ibis",
  "Sandhill Crane",
  "Osprey",
  "Bald Eagle",
];

// The interaction is the observation; the species is a secondary detail
// about it — so behaviors lead, species trails, and an unidentified bird
// with a known behavior never gets buried under a generic "Unidentified
// bird" label it doesn't need.
export function formatSighting(species: string | null, behaviors: string[]): string {
  const behaviorText = behaviors.length > 0 ? behaviors.join(", ") : null;
  if (behaviorText && species) return `${behaviorText} · ${species}`;
  if (behaviorText) return behaviorText;
  if (species) return species;
  return "Unidentified bird";
}

// Generate login URL at runtime so redirect URI reflects the current
// origin. Returns null (never throws) when OAuth isn't configured —
// local dev and mobile-LAN preview don't set VITE_OAUTH_PORTAL_URL /
// VITE_APP_ID, and building `new URL("undefined/app-auth")` would throw
// "Invalid URL". Callers must treat null as "sign-in unavailable here,"
// not fall back to a broken link. Production, where both vars are set,
// behaves exactly as before.
export const getLoginUrl = (): string | null => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  if (!oauthPortalUrl || !appId) return null;

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
