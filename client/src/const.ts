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

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
