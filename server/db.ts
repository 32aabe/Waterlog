import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, locations, observations, type Location, type Observation } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Helper function to safely parse JSON array columns (behaviors)
function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as string[];

  try {
    const parsed = JSON.parse(value as string);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [value as string];
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// Water Spots & Moments — a product-language adapter over Ver.2's original
// `locations` / `observations` tables.
//
// Per product decision (2026-07-03): don't introduce WaterSpot/Moment/
// Sighting as first-class tables yet. Validate the new experience on real
// usage first; a schema redesign can follow once there's evidence for it.
// A "spot" is a `locations` row. A "moment" (with exactly one "sighting")
// is an `observations` row. Lifecycle state is computed at read time from
// recent observations rather than stored.
// ---------------------------------------------------------------------------

export const UNIDENTIFIED_SPECIES = "Unidentified bird";
// `observations.species` is NOT NULL, so a pure water-spot check (no bird
// involved at all) needs its own sentinel distinct from "a bird was here,
// species unknown" — otherwise every moment would render a fake bird
// sighting, which undercuts water-interaction-first capture as much as a
// species-first one would. Never shown to users; filtered out on read.
const NO_SIGHTING = "__no_sighting__";

export type LifecycleState = "alive" | "drying" | "dry" | "reawakened";

export type SpotSummary = {
  id: number;
  creatorId: number;
  name: string | null;
  latitude: string;
  longitude: string;
  placeName: string | null;
  spotType: string;
  lifecycleState: LifecycleState;
  firstSeenAt: Date;
  lastActivityAt: Date;
};

export type MomentSighting = {
  id: number;
  species: string | null;
  count: number | null;
  behaviors: string[];
};

export type MomentSummary = {
  id: number;
  spotId: number | null;
  userId: number;
  capturedAt: Date;
  note: string | null;
  photoUrls: string[];
  waterCondition: string | null;
  sightings: MomentSighting[];
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * A spot's lifecycle is derived, not stored: look at its most recent
 * observation(s) rather than a persisted state column. A spot reported
 * "dry" is dry; one whose last report was "dry" and just got a fresh,
 * non-dry report is "reawakened"; one with no report in over a week is
 * "drying"; otherwise it's "alive".
 */
async function deriveLifecycle(
  db: Db,
  locationId: number,
  locationCreatedAt: Date,
): Promise<{ state: LifecycleState; lastActivityAt: Date }> {
  const recent = await db
    .select()
    .from(observations)
    .where(eq(observations.locationId, locationId))
    .orderBy(desc(observations.createdAt))
    .limit(2);

  if (recent.length === 0) {
    return { state: "alive", lastActivityAt: locationCreatedAt };
  }

  const [latest, prior] = recent;
  const daysSinceLatest = (Date.now() - new Date(latest.createdAt).getTime()) / 86_400_000;

  if (latest.waterDepth === "dry") {
    return { state: "dry", lastActivityAt: latest.createdAt };
  }
  if (prior?.waterDepth === "dry" && daysSinceLatest < 3) {
    return { state: "reawakened", lastActivityAt: latest.createdAt };
  }
  if (daysSinceLatest > 7) {
    return { state: "drying", lastActivityAt: latest.createdAt };
  }
  return { state: "alive", lastActivityAt: latest.createdAt };
}

function toSpotSummary(
  loc: Location,
  lifecycle: { state: LifecycleState; lastActivityAt: Date },
): SpotSummary {
  return {
    id: loc.id,
    creatorId: loc.userId,
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    placeName: loc.placeName,
    spotType: loc.waterResourceType ?? "other",
    lifecycleState: lifecycle.state,
    firstSeenAt: loc.createdAt,
    lastActivityAt: lifecycle.lastActivityAt,
  };
}

function toMomentSummary(obs: Observation): MomentSummary {
  return {
    id: obs.id,
    spotId: obs.locationId,
    userId: obs.userId,
    capturedAt: obs.createdAt,
    note: obs.notes,
    photoUrls: obs.photoUrl ? [obs.photoUrl] : [],
    waterCondition: obs.waterDepth,
    sightings:
      obs.species === NO_SIGHTING
        ? []
        : [
            {
              id: obs.id,
              species: obs.species === UNIDENTIFIED_SPECIES ? null : obs.species,
              count: obs.count,
              behaviors: parseJsonArray(obs.primaryBehaviors),
            },
          ],
  };
}

export async function createSpot(data: {
  creatorId: number;
  name?: string;
  latitude: number;
  longitude: number;
  placeName?: string;
  spotType?: string;
}): Promise<SpotSummary | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(locations).values({
    userId: data.creatorId,
    name: data.name,
    latitude: data.latitude.toString() as any,
    longitude: data.longitude.toString() as any,
    placeName: data.placeName,
    waterResourceType: data.spotType ?? "other",
  });

  return getSpotById(Number((result as any).insertId));
}

export async function listSpots(): Promise<SpotSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(locations).orderBy(desc(locations.createdAt));
  return Promise.all(
    rows.map(async loc => toSpotSummary(loc, await deriveLifecycle(db, loc.id, loc.createdAt))),
  );
}

export async function getSpotById(id: number): Promise<SpotSummary | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  if (rows.length === 0) return null;

  const lifecycle = await deriveLifecycle(db, id, rows[0].createdAt);
  return toSpotSummary(rows[0], lifecycle);
}

/**
 * A spot's story: the spot itself plus every moment logged there, newest
 * first.
 */
export async function getSpotDetail(spotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const spot = await getSpotById(spotId);
  if (!spot) return null;

  const rows = await db
    .select()
    .from(observations)
    .where(eq(observations.locationId, spotId))
    .orderBy(desc(observations.createdAt));

  return { spot, moments: rows.map(toMomentSummary) };
}

/**
 * Log a Moment at a spot, with its (single) bird Sighting if any — the
 * write path behind the under-10-second capture flow. `spotId`/`userId`
 * become `locationId`/`userId` on the observation. Behavior alone (no
 * species typed) is a complete sighting — water interaction is the
 * observation, species is secondary detail about it. Omitting a sighting
 * entirely (no behavior tapped, no species typed) is also complete: a
 * plain water-spot check with no bird involved.
 */
export async function createMoment(data: {
  spotId: number;
  userId: number;
  note?: string;
  photoUrls?: string[];
  waterCondition?: string;
  sightings?: Array<{
    species?: string;
    count?: number;
    behaviors?: string[];
  }>;
}): Promise<MomentSummary | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const spotRows = await db.select().from(locations).where(eq(locations.id, data.spotId)).limit(1);
  if (spotRows.length === 0) throw new Error("Water spot not found");
  const spot = spotRows[0];

  const sighting = data.sightings?.[0];
  const now = new Date();

  const result = await db.insert(observations).values({
    userId: data.userId,
    locationId: data.spotId,
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 19),
    latitude: spot.latitude,
    longitude: spot.longitude,
    placeName: spot.placeName,
    species: sighting ? sighting.species || UNIDENTIFIED_SPECIES : NO_SIGHTING,
    count: sighting?.count ?? 1,
    primaryBehaviors: sighting?.behaviors ? JSON.stringify(sighting.behaviors) : null,
    waterResourceType: spot.waterResourceType,
    waterDepth: data.waterCondition,
    notes: data.note,
    photoUrl: data.photoUrls?.[0],
  });

  return getMomentById(Number((result as any).insertId));
}

export async function getMomentById(id: number): Promise<MomentSummary | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(observations).where(eq(observations.id, id)).limit(1);
  return rows.length > 0 ? toMomentSummary(rows[0]) : null;
}

/**
 * A user's Journal: every moment they've logged, across every spot,
 * newest first — the time-first read of the same data the map reads
 * place-first.
 */
export async function listUserJournal(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(observations)
    .where(eq(observations.userId, userId))
    .orderBy(desc(observations.createdAt));

  return Promise.all(
    rows.map(async obs => ({
      ...toMomentSummary(obs),
      spot: obs.locationId ? await getSpotById(obs.locationId) : null,
    })),
  );
}

export async function getUserStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(observations).where(eq(observations.userId, userId));
  const spotIds = new Set(rows.map(r => r.locationId).filter((id): id is number => id !== null));
  const species = new Set(
    rows.map(r => r.species).filter(s => s && s !== UNIDENTIFIED_SPECIES && s !== NO_SIGHTING),
  );

  return {
    totalMoments: rows.length,
    spotsVisited: spotIds.size,
    uniqueSpecies: species.size,
  };
}
