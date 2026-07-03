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

export const WATER_CONDITIONS = [
  { value: "full", label: "Full" },
  { value: "receding", label: "Receding" },
  { value: "puddle_only", label: "Puddle only" },
  { value: "dry", label: "Dry" },
] as const;

export const BEHAVIOR_OPTIONS = ["Drinking", "Bathing", "Foraging", "Wading", "Preening", "Resting"];

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
