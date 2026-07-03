import { ENV } from "./_core/env";
import { getOrCreateLocalDevUser } from "./_core/context";
import * as db from "./db";

/**
 * Local-demo-only seed data — populates a handful of varied water spots,
 * moments, sightings, and placeholder photos so the app can be looked at
 * with real volume instead of an empty state. Dev-only by construction:
 * server/_core/index.ts only mounts the route that calls this when
 * !ENV.isProduction, and this function itself refuses to run in
 * production as a second guard. Safe to call more than once — it just
 * adds another batch of the same spots/moments.
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
  if (ENV.isProduction) {
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

  // --- Spot 1: a puddle with a year of history, for "On this day" ---
  const puddle = await db.createSpot({
    creatorId: user.id,
    name: "Puddle by the bus stop",
    latitude: 37.7752,
    longitude: -122.4196,
    spotType: "puddle",
    createdAt: daysAgo(400),
  });
  if (puddle) {
    await createMoment({
      spotId: puddle.id,
      userId: user.id,
      waterCondition: "full",
      note: "First time noticing this one — a sparrow was already using it.",
      sightings: [{ species: "House Sparrow", behaviors: ["Drinking"] }],
      photoUrls: [placeholderPhoto(205, "Puddle")],
      weather: "Partly cloudy",
      capturedAt: sameDayLastYear(10),
    });
    await createMoment({
      spotId: puddle.id,
      userId: user.id,
      waterCondition: "full",
      note: "Still here, still popular.",
      sightings: [{ species: "House Sparrow", behaviors: ["Drinking", "Bathing"] }],
      photoUrls: [placeholderPhoto(205, "Puddle")],
      weather: "Sunny",
      capturedAt: daysAgo(0, 3),
    });
  }

  // --- Spot 2: a fountain, multi-sighting + a second visit ---
  const fountain = await db.createSpot({
    creatorId: user.id,
    name: "Fountain at the park",
    latitude: 37.7738,
    longitude: -122.4213,
    spotType: "fountain",
    createdAt: daysAgo(15),
  });
  if (fountain) {
    await createMoment({
      spotId: fountain.id,
      userId: user.id,
      waterCondition: "full",
      note: "Busy little fountain today — at least two regulars stopped by.",
      sightings: [
        { species: "European Starling", behaviors: ["Bathing", "Drinking"] },
        { species: "Rock Pigeon", behaviors: ["Wading"] },
      ],
      photoUrls: [placeholderPhoto(150, "Fountain")],
      weather: "Sunny",
      capturedAt: daysAgo(0, 2),
    });
    await createMoment({
      spotId: fountain.id,
      userId: user.id,
      waterCondition: "full",
      sightings: [{ species: "House Finch", behaviors: ["Preening"] }],
      weather: "Overcast",
      capturedAt: daysAgo(1),
    });
  }

  // --- Spot 3: a pond that dried up (lifecycle: "dry") ---
  const pond = await db.createSpot({
    creatorId: user.id,
    name: "Pond behind the library",
    latitude: 37.7761,
    longitude: -122.4177,
    spotType: "pond",
    createdAt: daysAgo(60),
  });
  if (pond) {
    await createMoment({
      spotId: pond.id,
      userId: user.id,
      waterCondition: "dry",
      note: "Completely dried up this week — no birds around it anymore.",
      weather: "Hot, clear",
      capturedAt: daysAgo(10),
    });
  }

  // --- Spot 4: a drainage channel that came back (lifecycle: "reawakened") ---
  const drainage = await db.createSpot({
    creatorId: user.id,
    name: "Drainage ditch on Elm St",
    latitude: 37.7729,
    longitude: -122.4159,
    spotType: "drainage",
    createdAt: daysAgo(45),
  });
  if (drainage) {
    await createMoment({
      spotId: drainage.id,
      userId: user.id,
      waterCondition: "dry",
      note: "Nothing here — bone dry.",
      weather: "Clear",
      capturedAt: daysAgo(10),
    });
    await createMoment({
      spotId: drainage.id,
      userId: user.id,
      waterCondition: "full",
      note: "Rained overnight and the ditch filled back up — a mallard found it within the hour.",
      sightings: [{ species: "Mallard", behaviors: ["Drinking", "Wading"] }],
      photoUrls: [placeholderPhoto(200, "Ditch")],
      weather: "Rain overnight, clearing",
      capturedAt: daysAgo(0),
    });
  }

  // --- Spot 5: a container spot demonstrating an ice condition + a birdless check ---
  const container = await db.createSpot({
    creatorId: user.id,
    name: "Water dish in community garden",
    latitude: 37.7745,
    longitude: -122.4231,
    spotType: "container",
    createdAt: daysAgo(5),
  });
  if (container) {
    await createMoment({
      spotId: container.id,
      userId: user.id,
      waterCondition: "frozen",
      note: "Frozen solid this morning — checked, no visitors.",
      weather: "Cold, clear",
      capturedAt: daysAgo(0, 1),
    });
  }

  const spots = [puddle, fountain, pond, drainage, container].filter(Boolean).length;
  return { spots, moments: momentCount };
}
