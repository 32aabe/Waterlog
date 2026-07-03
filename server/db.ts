import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  waterSpots,
  moments,
  sightings,
  type WaterSpot,
} from "../drizzle/schema";
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

// Helper function to safely parse JSON array columns (behaviors, photoUrls)
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

/**
 * Create a new Water Spot. Every spot starts "alive" — it was just seen.
 */
export async function createSpot(data: {
  creatorId: number;
  name?: string;
  latitude: number;
  longitude: number;
  placeName?: string;
  spotType?: WaterSpot["spotType"];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const result = await db.insert(waterSpots).values({
    creatorId: data.creatorId,
    name: data.name,
    latitude: data.latitude.toString() as any,
    longitude: data.longitude.toString() as any,
    placeName: data.placeName,
    spotType: data.spotType ?? "other",
    lifecycleState: "alive",
    firstSeenAt: now,
    lastActivityAt: now,
  });

  return getSpotById(Number((result as any).insertId));
}

export async function listSpots() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(waterSpots).orderBy(desc(waterSpots.lastActivityAt));
}

export async function getSpotById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(waterSpots).where(eq(waterSpots.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Derive a spot's next lifecycle state from the water condition reported in
 * a new moment. A spot coming back from "dry" is a "reawakened" moment —
 * worth celebrating in the UI. Time-based decay toward "drying"/"dry" for
 * spots with no recent activity is a later milestone (needs a scheduled
 * job, not just a write-time rule).
 */
function nextLifecycleState(
  previous: WaterSpot["lifecycleState"],
  waterCondition: string | undefined,
): WaterSpot["lifecycleState"] {
  if (waterCondition === "dry") return "dry";
  if (previous === "dry") return "reawakened";
  return "alive";
}

/**
 * Log a Moment at a spot, with any bird Sightings observed during it, in a
 * single call — this is the write path behind the under-10-second capture
 * flow. Also updates the parent spot's lifecycle state and activity time.
 */
export async function createMoment(data: {
  spotId: number;
  userId: number;
  note?: string;
  photoUrls?: string[];
  voiceNoteUrl?: string;
  transcript?: string;
  waterCondition?: string;
  weather?: string;
  temperature?: number;
  sightings?: Array<{
    species?: string;
    count?: number;
    behaviors?: string[];
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const spot = await getSpotById(data.spotId);
  if (!spot) throw new Error("Water spot not found");

  const momentResult = await db.insert(moments).values({
    spotId: data.spotId,
    userId: data.userId,
    note: data.note,
    photoUrls: data.photoUrls ? JSON.stringify(data.photoUrls) : null,
    voiceNoteUrl: data.voiceNoteUrl,
    transcript: data.transcript,
    waterCondition: data.waterCondition,
    weather: data.weather,
    temperature: data.temperature !== undefined ? (data.temperature.toString() as any) : null,
  });

  const momentId = Number((momentResult as any).insertId);

  if (data.sightings && data.sightings.length > 0) {
    await db.insert(sightings).values(
      data.sightings.map(s => ({
        momentId,
        species: s.species,
        count: s.count ?? 1,
        behaviors: s.behaviors ? JSON.stringify(s.behaviors) : null,
      })),
    );
  }

  await db
    .update(waterSpots)
    .set({
      lastActivityAt: new Date(),
      lifecycleState: nextLifecycleState(spot.lifecycleState, data.waterCondition),
    })
    .where(eq(waterSpots.id, data.spotId));

  return getMomentById(momentId);
}

export async function getMomentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const momentResult = await db.select().from(moments).where(eq(moments.id, id)).limit(1);
  if (momentResult.length === 0) return null;

  const sightingRows = await db.select().from(sightings).where(eq(sightings.momentId, id));

  return {
    ...momentResult[0],
    photoUrls: parseJsonArray(momentResult[0].photoUrls),
    sightings: sightingRows.map(s => ({ ...s, behaviors: parseJsonArray(s.behaviors) })),
  };
}

/**
 * A spot's story: the spot itself plus every moment logged there, newest
 * first, each with its sightings attached.
 */
export async function getSpotDetail(spotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const spot = await getSpotById(spotId);
  if (!spot) return null;

  const momentRows = await db
    .select()
    .from(moments)
    .where(eq(moments.spotId, spotId))
    .orderBy(desc(moments.capturedAt));

  const momentsWithSightings = await Promise.all(
    momentRows.map(async m => {
      const sightingRows = await db.select().from(sightings).where(eq(sightings.momentId, m.id));
      return {
        ...m,
        photoUrls: parseJsonArray(m.photoUrls),
        sightings: sightingRows.map(s => ({ ...s, behaviors: parseJsonArray(s.behaviors) })),
      };
    }),
  );

  return { spot, moments: momentsWithSightings };
}

/**
 * A user's Journal: every moment they've logged, across every spot, newest
 * first — the time-first read of the same data the map reads place-first.
 */
export async function listUserJournal(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const momentRows = await db
    .select()
    .from(moments)
    .where(eq(moments.userId, userId))
    .orderBy(desc(moments.capturedAt));

  return Promise.all(
    momentRows.map(async m => {
      const [spot, sightingRows] = await Promise.all([
        getSpotById(m.spotId),
        db.select().from(sightings).where(eq(sightings.momentId, m.id)),
      ]);
      return {
        ...m,
        photoUrls: parseJsonArray(m.photoUrls),
        sightings: sightingRows.map(s => ({ ...s, behaviors: parseJsonArray(s.behaviors) })),
        spot,
      };
    }),
  );
}

export async function getUserStats(userId: number) {
  const journal = await listUserJournal(userId);
  const spotIds = new Set(journal.map(m => m.spotId));
  const species = new Set(
    journal.flatMap(m => m.sightings.map(s => s.species).filter((s): s is string => Boolean(s))),
  );

  return {
    totalMoments: journal.length,
    spotsVisited: spotIds.size,
    uniqueSpecies: species.size,
  };
}
