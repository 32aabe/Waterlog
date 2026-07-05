import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import { InsertUser, users, locations, observations, type Location, type Observation } from "../drizzle/schema";
import { ENV } from './_core/env';
import { memoryStore } from "./memoryStore";

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

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DataSource = { mode: "sql"; db: Db } | { mode: "memory" };

/**
 * Picks the real MySQL backend when DATABASE_URL is configured; falls
 * back to the in-memory store (server/memoryStore.ts) only when NOT in
 * production — so a bare local checkout or phone-LAN preview still works
 * for Capture/Map/Journal/Spots/Profile, while a real deployment missing
 * DATABASE_URL still fails loudly instead of silently demoing on fake
 * data. This is the one gate every data function below goes through.
 */
async function resolveDataSource(): Promise<DataSource> {
  const db = await getDb();
  if (db) return { mode: "sql", db };
  if (ENV.isProduction) {
    throw new Error("Database not available");
  }
  return { mode: "memory" };
}

// Helper function to safely parse JSON array columns (behaviors, photoUrl)
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
    if (!ENV.isProduction) {
      await memoryStore.upsertUser(user);
      return;
    }
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
    if (!ENV.isProduction) {
      return memoryStore.getUserByOpenId(openId);
    }
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
// A "spot" is a `locations` row. A "moment" is one or more `observations`
// rows sharing a moment group key (see MOMENT_GROUP_KEY below) — one row
// per bird Sighting, or a single NO_SIGHTING row for a plain water-spot
// check. Lifecycle state is computed at read time from recent observations
// rather than stored.
//
// Everything below is backend-agnostic by construction: groupObservations-
// IntoMoments, computeLifecycle, and toSpotSummary are pure functions over
// already-fetched rows, so the same logic runs whether those rows came
// from MySQL or the in-memory store (see resolveDataSource above).
// ---------------------------------------------------------------------------

export const UNIDENTIFIED_SPECIES = "Unidentified bird";
// `observations.species` is NOT NULL, so a pure water-spot check (no bird
// involved at all) needs its own sentinel distinct from "a bird was here,
// species unknown" — otherwise every moment would render a fake bird
// sighting, which undercuts water-interaction-first capture as much as a
// species-first one would. Never shown to users; filtered out on read.
const NO_SIGHTING = "__no_sighting__";

// Multi-sighting moments (Milestone 2) need multiple `observations` rows —
// one per bird — that read back as a single Moment. `distanceFromWater`
// is an unused legacy column (Ver.3 never collects it), repurposed here to
// hold a short random key shared by every row inserted from the same
// capture. Rows without one (or with a unique one) are simply their own
// singleton moment, so this is fully backward-compatible with the
// single-row moments Milestone 1/2 already created.
const MOMENT_GROUP_KEY_LENGTH = 10;

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
  /** Every moment ever logged at this spot — a Spot is a place where time
   *  gathers, so this is a true lifetime total, not a recent-activity hint. */
  momentCount: number;
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
  /** Ambient weather at capture time (see client/src/lib/weather.ts), e.g.
   *  "Foggy, 53°F" — stored per-observation but previously never read back
   *  out to any client. Powers the Spot Overview's "recent atmosphere". */
  weather: string | null;
  sightings: MomentSighting[];
};

/**
 * Reassemble raw `observations` rows into Moments: rows sharing a non-null
 * `distanceFromWater` group key are sibling Sightings of one Moment (same
 * photo/note/water condition, different bird); everything else is its own
 * singleton Moment. Preserves the newest-first order of the input rows.
 */
function groupObservationsIntoMoments(rows: Observation[]): MomentSummary[] {
  const groups = new Map<string, Observation[]>();
  const order: string[] = [];

  for (const row of rows) {
    const key = row.distanceFromWater ? `g:${row.distanceFromWater}` : `r:${row.id}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      order.push(key);
    }
    group.push(row);
  }

  return order.map(key => {
    const groupRows = groups.get(key)!;
    // Shared moment-level fields are identical across sibling rows by
    // construction (see createMoment) — any row in the group can be
    // "primary" for them.
    const primary = groupRows[0];

    return {
      id: primary.id,
      spotId: primary.locationId,
      userId: primary.userId,
      capturedAt: primary.createdAt,
      note: primary.notes,
      photoUrls: parseJsonArray(primary.photoUrl),
      waterCondition: primary.waterDepth,
      weather: primary.weather,
      sightings: groupRows
        .filter(r => r.species !== NO_SIGHTING)
        .map(r => ({
          id: r.id,
          species: r.species === UNIDENTIFIED_SPECIES ? null : r.species,
          count: r.count,
          behaviors: parseJsonArray(r.primaryBehaviors),
        })),
    };
  });
}

/**
 * A spot's lifecycle is derived, not stored: look at its most recent
 * Moment(s) rather than a persisted state column. A spot reported "dry" is
 * dry; one whose last report was "dry" and just got a fresh, non-dry
 * report is "reawakened"; one with no report in over a week is "drying";
 * otherwise it's "alive". Groups rows into moments first so a
 * multi-sighting visit (several sibling rows) counts as one data point,
 * not several. Pure — takes every observation row for the spot; see
 * fetchSpotObservationRows for where those rows come from.
 */
function computeLifecycle(rows: Observation[], locationCreatedAt: Date): { state: LifecycleState; lastActivityAt: Date } {
  if (rows.length === 0) {
    return { state: "alive", lastActivityAt: locationCreatedAt };
  }

  const moments = groupObservationsIntoMoments(rows);
  const [latest, prior] = moments;
  const daysSinceLatest = (Date.now() - new Date(latest.capturedAt).getTime()) / 86_400_000;

  if (latest.waterCondition === "dry") {
    return { state: "dry", lastActivityAt: latest.capturedAt };
  }
  if (prior?.waterCondition === "dry" && daysSinceLatest < 3) {
    return { state: "reawakened", lastActivityAt: latest.capturedAt };
  }
  if (daysSinceLatest > 7) {
    return { state: "drying", lastActivityAt: latest.capturedAt };
  }
  return { state: "alive", lastActivityAt: latest.capturedAt };
}

/**
 * Every observation ever logged at a spot, newest first — used both to
 * derive lifecycle (only the first couple of rows matter for that) and to
 * count the spot's true lifetime moment total. A personal water journal's
 * per-spot history is small enough that fetching all of it is cheap; no
 * window or cap.
 */
async function fetchSpotObservationRows(source: DataSource, locationId: number): Promise<Observation[]> {
  if (source.mode === "memory") {
    return memoryStore.listObservationsByLocationId(locationId);
  }
  return source.db.select().from(observations).where(eq(observations.locationId, locationId)).orderBy(desc(observations.createdAt));
}

function toSpotSummary(
  loc: Location,
  lifecycle: { state: LifecycleState; lastActivityAt: Date },
  momentCount: number,
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
    momentCount,
  };
}

export async function createSpot(data: {
  creatorId: number;
  name?: string;
  latitude: number;
  longitude: number;
  placeName?: string;
  spotType?: string;
  /** Server-internal only — not in the tRPC router's input schema, so no
   *  real request can backdate a spot. Lets server/seedDemoData.ts create
   *  spots that read as "discovered N days ago" instead of everything
   *  being "just now". */
  createdAt?: Date;
}): Promise<SpotSummary | null> {
  const source = await resolveDataSource();
  const rowData = {
    userId: data.creatorId,
    name: data.name ?? null,
    latitude: data.latitude.toString(),
    longitude: data.longitude.toString(),
    placeName: data.placeName ?? null,
    waterResourceType: data.spotType ?? "other",
    ...(data.createdAt ? { createdAt: data.createdAt, updatedAt: data.createdAt } : {}),
  };

  const insertedId =
    source.mode === "memory"
      ? (await memoryStore.insertLocation(rowData)).id
      : Number((await source.db.insert(locations).values(rowData as any) as any).insertId);

  return getSpotById(insertedId);
}

export async function listSpots(): Promise<SpotSummary[]> {
  const source = await resolveDataSource();
  const rows =
    source.mode === "memory"
      ? await memoryStore.listLocations()
      : await source.db.select().from(locations).orderBy(desc(locations.createdAt));

  return Promise.all(
    rows.map(async loc => {
      const obsRows = await fetchSpotObservationRows(source, loc.id);
      return toSpotSummary(loc, computeLifecycle(obsRows, loc.createdAt), groupObservationsIntoMoments(obsRows).length);
    }),
  );
}

export async function getSpotById(id: number): Promise<SpotSummary | null> {
  const source = await resolveDataSource();
  const row =
    source.mode === "memory"
      ? await memoryStore.getLocationById(id)
      : (await source.db.select().from(locations).where(eq(locations.id, id)).limit(1))[0];
  if (!row) return null;

  const obsRows = await fetchSpotObservationRows(source, id);
  return toSpotSummary(row, computeLifecycle(obsRows, row.createdAt), groupObservationsIntoMoments(obsRows).length);
}

/**
 * A spot's story: the spot itself plus every moment logged there, newest
 * first.
 */
export async function getSpotDetail(spotId: number) {
  const spot = await getSpotById(spotId);
  if (!spot) return null;

  const source = await resolveDataSource();
  const rows =
    source.mode === "memory"
      ? await memoryStore.listObservationsByLocationId(spotId)
      : await source.db
          .select()
          .from(observations)
          .where(eq(observations.locationId, spotId))
          .orderBy(desc(observations.createdAt));

  return { spot, moments: groupObservationsIntoMoments(rows) };
}

/**
 * Log a Moment at a spot: one or more bird Sightings (or none, for a plain
 * water-spot check) sharing a photo/note/water condition — the write path
 * behind the under-10-second capture flow. `spotId`/`userId` become
 * `locationId`/`userId` on each observation row. Behavior alone (no
 * species typed) is a complete sighting — water interaction is the
 * observation, species is secondary detail about it. Multiple sightings
 * become multiple rows sharing one moment group key (see
 * MOMENT_GROUP_KEY_LENGTH above); each additional row costs one insert,
 * not extra taps for whoever is just logging a single bird, the common
 * case.
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
  weather?: string;
  /** Server-internal only — not in the tRPC router's input schema, so no
   *  real request can backdate a moment. Used by server/seedDemoData.ts. */
  capturedAt?: Date;
}): Promise<MomentSummary | null> {
  const source = await resolveDataSource();

  const spot =
    source.mode === "memory"
      ? await memoryStore.getLocationById(data.spotId)
      : (await source.db.select().from(locations).where(eq(locations.id, data.spotId)).limit(1))[0];
  if (!spot) throw new Error("Water spot not found");

  const now = data.capturedAt ?? new Date();
  const groupKey = nanoid(MOMENT_GROUP_KEY_LENGTH);
  const photoValue =
    data.photoUrls && data.photoUrls.length > 0 ? JSON.stringify(data.photoUrls) : null;
  const sightingsToInsert = data.sightings && data.sightings.length > 0 ? data.sightings : [undefined];

  let firstInsertedId: number | null = null;
  for (const sighting of sightingsToInsert) {
    const rowData = {
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
      distanceFromWater: groupKey,
      notes: data.note,
      photoUrl: photoValue,
      weather: data.weather,
      ...(data.capturedAt ? { createdAt: data.capturedAt, updatedAt: data.capturedAt } : {}),
    };

    const insertedId =
      source.mode === "memory"
        ? (await memoryStore.insertObservation(rowData)).id
        : Number((await source.db.insert(observations).values(rowData as any) as any).insertId);
    firstInsertedId ??= insertedId;
  }

  return firstInsertedId !== null ? getMomentById(firstInsertedId) : null;
}

/**
 * Look up a Moment by any one of its sibling row ids — resolves the full
 * group (see groupObservationsIntoMoments) so a freshly created
 * multi-sighting moment reads back with every sighting attached, not just
 * the row whose id was returned from the insert.
 */
export async function getMomentById(id: number): Promise<MomentSummary | null> {
  const source = await resolveDataSource();

  const row =
    source.mode === "memory"
      ? await memoryStore.getObservationById(id)
      : (await source.db.select().from(observations).where(eq(observations.id, id)).limit(1))[0];
  if (!row) return null;

  const groupKey = row.distanceFromWater;
  const siblingRows = groupKey
    ? source.mode === "memory"
      ? await memoryStore.listObservationsByGroupKey(groupKey)
      : await source.db.select().from(observations).where(eq(observations.distanceFromWater, groupKey))
    : [row];

  return groupObservationsIntoMoments(siblingRows)[0] ?? null;
}

/**
 * A user's Journal: every moment they've logged, across every spot,
 * newest first — the time-first read of the same data the map reads
 * place-first.
 */
export async function listUserJournal(userId: number) {
  const source = await resolveDataSource();
  const rows =
    source.mode === "memory"
      ? await memoryStore.listObservationsByUserId(userId)
      : await source.db
          .select()
          .from(observations)
          .where(eq(observations.userId, userId))
          .orderBy(desc(observations.createdAt));

  const moments = groupObservationsIntoMoments(rows);

  return Promise.all(
    moments.map(async moment => ({
      ...moment,
      spot: moment.spotId ? await getSpotById(moment.spotId) : null,
    })),
  );
}

export async function getUserStats(userId: number) {
  const source = await resolveDataSource();
  const rows =
    source.mode === "memory"
      ? await memoryStore.listObservationsByUserId(userId)
      : await source.db.select().from(observations).where(eq(observations.userId, userId));

  const moments = groupObservationsIntoMoments(rows);
  const spotIds = new Set(rows.map(r => r.locationId).filter((id): id is number => id !== null));
  const species = new Set(
    rows.map(r => r.species).filter(s => s && s !== UNIDENTIFIED_SPECIES && s !== NO_SIGHTING),
  );

  return {
    totalMoments: moments.length,
    spotsVisited: spotIds.size,
    uniqueSpecies: species.size,
  };
}
