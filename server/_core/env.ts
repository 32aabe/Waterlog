export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Opt-in escape hatch from production's normal "real DB + real OAuth or
  // fail loudly" requirement (see resolveDataSource in db.ts) — for
  // deploying a public, zero-dependency demo link (e.g. Railway) where
  // provisioning a real database/OAuth app isn't the point. Every call
  // site that gates on `ENV.isProduction` to decide whether the in-memory
  // store / Local Dev Admin / data: URL media fallback is allowed also
  // checks this, so demo mode reuses exactly the same fallback behavior
  // local dev already relies on — never a separate code path. Only ever
  // widens what production allows; a deployment that leaves this unset
  // (the default) keeps today's real-DB/real-OAuth requirement exactly
  // as-is.
  demoMode: process.env.WATERLOG_DEMO_MODE === "true",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Server-side Google Maps calls (currently just Geocoding, see
  // server/_core/map.ts) need their own key — separate from
  // VITE_GOOGLE_MAPS_API_KEY, which is HTTP-referrer-restricted for
  // browser use and won't authenticate a server-to-server request.
  // Blank until a second, IP-restricted/unrestricted key is provisioned;
  // see describeLocation()'s null fallback in server/_core/geocode.ts.
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
};
