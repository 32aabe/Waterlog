import { ENV } from "./_core/env";
import { getOrCreateLocalDevUser } from "./_core/context";
import * as db from "./db";

/**
 * Local-demo seed data — populates a handful of varied water spots,
 * moments, sightings, and placeholder photos so the app can be looked at
 * with real volume instead of an empty state. Runs only outside real
 * production: in plain local dev, or in a WATERLOG_DEMO_MODE=true
 * deployment (see ENV.demoMode in _core/env.ts) — never in a real
 * (non-demo) production deployment. server/_core/index.ts's
 * autoSeedDemoDataIfEmpty() is what actually calls this for a demo
 * deployment (once, at boot, only if there's nothing seeded yet); the
 * manual /api/dev/seed-demo-data route stays blocked in all production
 * deployments, demo mode included, since it's an unauthenticated public
 * mutation and auto-seed-if-empty already covers "keep demo spots
 * available." Safe to call more than once regardless — it just adds
 * another batch of the same spots/moments.
 */

function daysAgo(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
}

function sameDayLastYear(hour: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), hour, 0, 0);
}

/** A small colored placeholder "photo" — no external image dependency. */
function placeholderPhoto(hue: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="hsl(${hue},50%,52%)"/><text x="120" y="128" font-size="20" fill="white" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function seedDemoData(): Promise<{ spots: number; moments: number }> {
  if (ENV.isProduction && !ENV.demoMode) {
    throw new Error("Demo seeding is not available in production");
  }

  const user = await getOrCreateLocalDevUser();
  if (!user) {
    throw new Error("Couldn't resolve a local dev user to seed data for — is this really running in dev mode?");
  }

  let momentCount = 0;
  const createMoment = async (params: Parameters<typeof db.createMoment>[0]) => {
    await db.createMoment(params);
    momentCount++;
  };

  // The AIR project's actual observation sites, not placeholder names —
  // two real-world clusters (Brooklyn Bridge Park's piers, and the
  // Foley Square/Civic Center blocks near Pace University and City Hall,
  // themselves built over the historic Collect Pond that Collect Pond
  // Park now commemorates) so both the real map and MapFallback's
  // cluster layout (see components/MapFallback.tsx) center on the same
  // two neighborhoods a reviewer would recognize.

  // --- Spot 1: Pier 1 Bridge View Pond — a year of history, for "On
  // this day" ---
  const bridgeViewPond = await db.createSpot({
    creatorId: user.id,
    name: "Pier 1 Bridge View Pond",
    latitude: 40.7027,
    longitude: -73.9963,
    placeName: "Brooklyn Bridge Park",
    spotType: "pond",
    createdAt: daysAgo(400),
  });
  if (bridgeViewPond) {
    await createMoment({
      spotId: bridgeViewPond.id,
      userId: user.id,
      waterCondition: "full",
      note: "First time noticing this one — a sparrow was already using it, with the Brooklyn Bridge right behind it.",
      sightings: [{ species: "House Sparrow", behaviors: ["Drinking"] }],
      photoUrls: [placeholderPhoto(205, "Bridge View")],
      weather: "Partly cloudy",
      capturedAt: sameDayLastYear(10),
    });
    await createMoment({
      spotId: bridgeViewPond.id,
      userId: user.id,
      waterCondition: "full",
      note: "Still here, still popular — a gull dropped in to bathe.",
      sightings: [{ species: "Ring-billed Gull", behaviors: ["Bathing"] }],
      photoUrls: [placeholderPhoto(205, "Bridge View")],
      weather: "Sunny",
      capturedAt: daysAgo(0, 3),
    });
  }

  // --- Spot 2: Pier 1 Long Pond — multi-sighting + a second visit ---
  const longPond = await db.createSpot({
    creatorId: user.id,
    name: "Pier 1 Long Pond",
    latitude: 40.7032,
    longitude: -73.997,
    placeName: "Brooklyn Bridge Park",
    spotType: "pond",
    createdAt: daysAgo(15),
  });
  if (longPond) {
    await createMoment({
      spotId: longPond.id,
      userId: user.id,
      waterCondition: "full",
      note: "Busy stretch of water today — at least two regulars stopped by.",
      sightings: [
        { species: "European Starling", behaviors: ["Bathing", "Drinking"] },
        { species: "Rock Pigeon", behaviors: ["Foraging"] },
      ],
      photoUrls: [placeholderPhoto(170, "Long Pond")],
      weather: "Sunny",
      capturedAt: daysAgo(0, 2),
    });
    await createMoment({
      spotId: longPond.id,
      userId: user.id,
      waterCondition: "full",
      sightings: [{ species: "Mallard", behaviors: ["Resting"] }],
      weather: "Overcast",
      capturedAt: daysAgo(1),
    });
  }

  // --- Spot 3: Pier 2 Intertidal Rocky Shore — tide out, then tide back
  // in (lifecycle: "reawakened") ---
  const rockyShore = await db.createSpot({
    creatorId: user.id,
    name: "Pier 2 Intertidal Rocky Shore",
    latitude: 40.7008,
    longitude: -73.9954,
    placeName: "Brooklyn Bridge Park",
    spotType: "wetland",
    createdAt: daysAgo(45),
  });
  if (rockyShore) {
    await createMoment({
      spotId: rockyShore.id,
      userId: user.id,
      waterCondition: "dry",
      note: "Low tide — the rocks are fully exposed, just a cormorant drying its wings out there.",
      sightings: [{ species: "Double-crested Cormorant", behaviors: ["Resting"] }],
      weather: "Clear",
      capturedAt: daysAgo(10),
    });
    await createMoment({
      spotId: rockyShore.id,
      userId: user.id,
      waterCondition: "full",
      note: "Tide's back in and covering the rocks — a heron was working the new waterline within the hour.",
      sightings: [{ species: "Great Blue Heron", behaviors: ["Foraging"] }],
      photoUrls: [placeholderPhoto(160, "Rocky Shore")],
      weather: "Clear",
      capturedAt: daysAgo(0),
    });
  }

  // --- Spot 4: Foley Square — a plaza puddle over what was once the
  // edge of the historic Collect Pond watershed (lifecycle: "dry") ---
  const foleySquare = await db.createSpot({
    creatorId: user.id,
    name: "Foley Square",
    latitude: 40.7141,
    longitude: -74.0021,
    placeName: "Civic Center, Manhattan",
    spotType: "puddle",
    createdAt: daysAgo(20),
  });
  if (foleySquare) {
    await createMoment({
      spotId: foleySquare.id,
      userId: user.id,
      waterCondition: "dry",
      note: "Plaza's bone dry today — no pooling since the last rain, no birds around it.",
      weather: "Clear",
      capturedAt: daysAgo(6),
    });
  }

  // --- Spot 5: Thomas Paine Park — receding after rain (lifecycle:
  // "drying"), the one lifecycle state none of the spots above show ---
  const thomasPainePark = await db.createSpot({
    creatorId: user.id,
    name: "Thomas Paine Park",
    latitude: 40.7146,
    longitude: -74.0027,
    placeName: "Civic Center, Manhattan",
    spotType: "temporary_pool",
    createdAt: daysAgo(20),
  });
  if (thomasPainePark) {
    await createMoment({
      spotId: thomasPainePark.id,
      userId: user.id,
      waterCondition: "receding",
      note: "Water's dropped a lot since I last checked — a sparrow still stopped to drink from what's left.",
      sightings: [{ species: "House Sparrow", behaviors: ["Drinking"] }],
      weather: "Clear",
      capturedAt: daysAgo(4),
    });
  }

  // --- Spot 6: Collect Pond Park — the historic pond itself, newest and
  // richest spot ---
  const collectPondPark = await db.createSpot({
    creatorId: user.id,
    name: "Collect Pond Park",
    latitude: 40.7168,
    longitude: -74.0026,
    placeName: "Civic Center, Manhattan",
    spotType: "pond",
    createdAt: daysAgo(5),
  });
  if (collectPondPark) {
    await createMoment({
      spotId: collectPondPark.id,
      userId: user.id,
      waterCondition: "full",
      note: "The reflecting pool on the site of the old Collect Pond — a goose and a mallard were both working it.",
      sightings: [
        { species: "Canada Goose", behaviors: ["Swimming"] },
        { species: "Mallard", behaviors: ["Foraging"] },
      ],
      photoUrls: [placeholderPhoto(195, "Collect Pond")],
      weather: "Sunny",
      capturedAt: daysAgo(0, 1),
    });
  }

  const spots = [bridgeViewPond, longPond, rockyShore, foleySquare, thomasPainePark, collectPondPark].filter(
    Boolean,
  ).length;
  return { spots, moments: momentCount };
}
