import fs from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";
import { getOrCreateLocalDevUser } from "./_core/context";
import * as db from "./db";

/**
 * Demo seed data — real AIR field observations, not fabricated content.
 * Sourced from 더미 데이터/bird-observations-2026-05-08.xlsx (the
 * "Observations", "Location Visits", and "Sessions" sheets, joined by
 * date + location + arrival/departure time) and 더미 데이터/*.jpg|png
 * (resized to a mobile-friendly size and moved into
 * client/public/demo-photos/, matched to a spot by filename — e.g.
 * Turtle_pond_*.jpg -> Pier 1 Bridge View Pond, the app's display name
 * for what the raw data calls "Pier 1 Turtle Pond"). The joined,
 * cleaned result lives in data/airObservations.json (repo root, not
 * server/ — see AIR_DATA_PATH below for why) so this file stays a loop,
 * not ~100 hand-written moment literals.
 *
 * Runs only outside real production: in plain local dev, or in a
 * WATERLOG_DEMO_MODE=true deployment (see ENV.demoMode in
 * _core/env.ts) — never in a real (non-demo) production deployment.
 * server/_core/index.ts's autoSeedDemoDataIfEmpty() is what actually
 * calls this for a demo deployment (once, at boot, only if there's
 * nothing seeded yet); the manual /api/dev/seed-demo-data route stays
 * blocked in all production deployments, demo mode included, since it's
 * an unauthenticated public mutation and auto-seed-if-empty already
 * covers "keep demo spots available." Safe to call more than once
 * regardless — it just adds another batch of the same spots/moments.
 */

type AirSighting = { species: string; count: number | null; behaviors: string[] };
type AirMoment = {
  capturedAt: string;
  waterCondition: string;
  note: string | null;
  weather: string | null;
  photoUrl: string | null;
  sightings: AirSighting[];
};
type AirSpot = {
  name: string;
  latitude: number;
  longitude: number;
  placeName: string;
  spotType: string;
  moments: AirMoment[];
};

// server/../data, not server/data — matches memoryStore.ts's own
// STORE_FILE resolution (see its comment): esbuild bundles this file's
// code into dist/index.js, so at runtime import.meta.dirname is
// server/ in dev (tsx, unbundled) but dist/ in production — both are
// direct children of the project root, so resolving ".." first lands on
// the same real project-root/data/ directory either way, without any
// dev/prod special-casing.
const AIR_DATA_PATH = path.resolve(import.meta.dirname, "..", "data", "airObservations.json");
const AIR_DATA: Record<string, AirSpot> = JSON.parse(fs.readFileSync(AIR_DATA_PATH, "utf-8"));

export async function seedDemoData(): Promise<{ spots: number; moments: number }> {
  if (ENV.isProduction && !ENV.demoMode) {
    throw new Error("Demo seeding is not available in production");
  }

  const user = await getOrCreateLocalDevUser();
  if (!user) {
    throw new Error("Couldn't resolve a local dev user to seed data for — is this really running in dev mode?");
  }

  let spotCount = 0;
  let momentCount = 0;

  for (const air of Object.values(AIR_DATA)) {
    // Ascending — the first (earliest) real visit becomes the spot's
    // createdAt, and moments are created in the order they actually
    // happened so lastActivityAt (computed from the newest inserted row)
    // reads as the real most recent field visit.
    const sortedMoments = [...air.moments].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const firstMoment = sortedMoments[0];

    const spot = await db.createSpot({
      creatorId: user.id,
      name: air.name,
      latitude: air.latitude,
      longitude: air.longitude,
      placeName: air.placeName,
      spotType: air.spotType,
      createdAt: firstMoment ? new Date(firstMoment.capturedAt) : new Date(),
    });
    if (!spot) continue;
    spotCount++;

    for (const moment of sortedMoments) {
      await db.createMoment({
        spotId: spot.id,
        userId: user.id,
        waterCondition: moment.waterCondition,
        note: moment.note ?? undefined,
        weather: moment.weather ?? undefined,
        photoUrls: moment.photoUrl ? [moment.photoUrl] : undefined,
        sightings: moment.sightings.map(s => ({
          species: s.species,
          count: s.count ?? undefined,
          behaviors: s.behaviors,
        })),
        capturedAt: new Date(moment.capturedAt),
      });
      momentCount++;
    }
  }

  return { spots: spotCount, moments: momentCount };
}
