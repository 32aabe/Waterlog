import fs from "node:fs";
import path from "node:path";
import type { InsertUser, User, Location, Observation } from "../drizzle/schema";

/**
 * In-memory fallback store — dev-only. Used by server/db.ts (see
 * resolveDataSource there) whenever no DATABASE_URL is configured and
 * NODE_ENV isn't "production", so the whole app (Map, Journal, Spots,
 * Profile, Capture) works with zero external dependencies for local
 * demoing. Row shapes match the drizzle-inferred User/Location/Observation
 * types exactly, so every read-side transform in db.ts
 * (groupObservationsIntoMoments, computeLifecycle, toSpotSummary) runs
 * unchanged regardless of which backend produced the rows.
 *
 * Survives a dev-server restart (see loadFromDisk/persist below) — it
 * used to wipe on every restart, which was fine for a from-scratch demo
 * but meant anything captured during a real local session (`tsx watch`
 * restarts on every server-file save) vanished the moment you touched an
 * unrelated file. Still not a real persistence layer: single JSON file,
 * last-write-wins, no migrations, no concurrent-writer safety — exactly
 * as safe as the in-memory store it's backing and no safer. Production
 * always requires a real DATABASE_URL; see resolveDataSource's
 * isProduction gate in db.ts, which this file is never reached without
 * failing anyway.
 */

const STORE_FILE = path.resolve(import.meta.dirname, "..", ".local-data", "store.json");

let nextUserId = 1;
let nextLocationId = 1;
let nextObservationId = 1;

let users: User[] = [];
let locations: Location[] = [];
let observations: Observation[] = [];

function clone<T>(value: T): T {
  return { ...value };
}

// Date fields round-trip through JSON as strings — this reverses that on
// load so callers (which all expect real Date objects, per the drizzle-
// inferred types above) never notice a JSON file is involved at all.
const DATE_FIELDS_BY_TABLE = {
  users: ["createdAt", "updatedAt", "lastSignedIn"],
  locations: ["createdAt", "updatedAt"],
  observations: ["createdAt", "updatedAt"],
} as const;

function reviveDates<T extends Record<string, unknown>>(rows: T[], fields: readonly string[]): T[] {
  for (const row of rows) {
    for (const field of fields) {
      if (typeof row[field] === "string") (row as Record<string, unknown>)[field] = new Date(row[field] as string);
    }
  }
  return rows;
}

// Loaded once at module init (process boot), not per-call — the whole
// point is avoiding a real database's per-request cost for local demoing.
function loadFromDisk(): void {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
    users = reviveDates(raw.users ?? [], DATE_FIELDS_BY_TABLE.users);
    locations = reviveDates(raw.locations ?? [], DATE_FIELDS_BY_TABLE.locations);
    observations = reviveDates(raw.observations ?? [], DATE_FIELDS_BY_TABLE.observations);
    nextUserId = raw.nextUserId ?? 1;
    nextLocationId = raw.nextLocationId ?? 1;
    nextObservationId = raw.nextObservationId ?? 1;
  } catch (err) {
    // Corrupt or unreadable file must never block boot — same principle
    // as every other "local demo" fallback in this codebase (see
    // server/storage.ts, describeLocation, etc.): degrade to empty
    // in-memory state, never crash the app over convenience data.
    console.warn("[memoryStore] Failed to load local persisted data, starting empty:", err instanceof Error ? err.message : err);
  }
}

// Synchronous and called after every mutation, not batched/debounced —
// local dev traffic is low enough that the I/O cost is a non-issue, and
// synchronous writes mean a crash or a fast subsequent read can never
// observe a mutation that hasn't actually reached disk yet.
function persist(): void {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ nextUserId, nextLocationId, nextObservationId, users, locations, observations }, null, 2),
    );
  } catch (err) {
    // Same principle as loadFromDisk: a write failure degrades to
    // "this session's data won't survive a restart" (today's old
    // behavior), never a crash.
    console.warn("[memoryStore] Failed to persist local data:", err instanceof Error ? err.message : err);
  }
}

loadFromDisk();

export type InsertLocationInput = {
  userId: number;
  name?: string | null;
  latitude: string;
  longitude: string;
  placeName?: string | null;
  waterResourceType?: string | null;
  /** Seed-data only in practice — lets a demo spot read as "discovered N
   *  days ago" instead of everything being "just now". */
  createdAt?: Date;
};

export type InsertObservationInput = {
  userId: number;
  locationId: number | null;
  date: string;
  time?: string | null;
  latitude: string;
  longitude: string;
  placeName?: string | null;
  species: string;
  count?: number | null;
  primaryBehaviors?: string | null;
  waterResourceType?: string | null;
  waterDepth?: string | null;
  distanceFromWater?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  weather?: string | null;
  /** Seed-data only in practice — backdates a demo moment. */
  createdAt?: Date;
};

export const memoryStore = {
  /** Exposed for tests / an explicit "start fresh" action; not called
   *  automatically. Now that data persists across restarts (see
   *  loadFromDisk/persist above), this is also the one way to actually
   *  get back to empty — deletes the persisted file too, not just the
   *  in-memory arrays. */
  reset() {
    users.length = 0;
    locations.length = 0;
    observations.length = 0;
    nextUserId = 1;
    nextLocationId = 1;
    nextObservationId = 1;
    try {
      fs.rmSync(STORE_FILE, { force: true });
    } catch (err) {
      console.warn("[memoryStore] Failed to delete persisted data file:", err instanceof Error ? err.message : err);
    }
  },

  async getUserByOpenId(openId: string): Promise<User | undefined> {
    const found = users.find(u => u.openId === openId);
    return found ? clone(found) : undefined;
  },

  async upsertUser(data: InsertUser): Promise<void> {
    const now = new Date();
    const existing = users.find(u => u.openId === data.openId);
    if (existing) {
      if (data.name !== undefined) existing.name = data.name;
      if (data.email !== undefined) existing.email = data.email;
      if (data.loginMethod !== undefined) existing.loginMethod = data.loginMethod;
      if (data.role !== undefined) existing.role = data.role;
      existing.lastSignedIn = data.lastSignedIn ?? now;
      existing.updatedAt = now;
      persist();
      return;
    }
    users.push({
      id: nextUserId++,
      openId: data.openId,
      name: data.name ?? null,
      email: data.email ?? null,
      loginMethod: data.loginMethod ?? null,
      role: data.role ?? "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: data.lastSignedIn ?? now,
    });
    persist();
  },

  async insertLocation(data: InsertLocationInput): Promise<Location> {
    const now = data.createdAt ?? new Date();
    const row: Location = {
      id: nextLocationId++,
      userId: data.userId,
      name: data.name ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      placeName: data.placeName ?? null,
      waterResourceType: data.waterResourceType ?? null,
      waterSalinity: null,
      waterOrigin: null,
      createdAt: now,
      updatedAt: now,
    };
    locations.push(row);
    persist();
    return clone(row);
  },

  async getLocationById(id: number): Promise<Location | undefined> {
    const found = locations.find(l => l.id === id);
    return found ? clone(found) : undefined;
  },

  async listLocations(): Promise<Location[]> {
    return [...locations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(clone);
  },

  async deleteLocation(id: number): Promise<void> {
    const index = locations.findIndex(l => l.id === id);
    if (index !== -1) locations.splice(index, 1);
    persist();
  },

  async deleteObservationsByLocationId(locationId: number): Promise<void> {
    for (let i = observations.length - 1; i >= 0; i--) {
      if (observations[i].locationId === locationId) observations.splice(i, 1);
    }
    persist();
  },

  async insertObservation(data: InsertObservationInput): Promise<Observation> {
    const now = data.createdAt ?? new Date();
    const row: Observation = {
      id: nextObservationId++,
      userId: data.userId,
      locationId: data.locationId,
      date: data.date,
      time: data.time ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      locationName: null,
      placeName: data.placeName ?? null,
      species: data.species,
      count: data.count ?? 1,
      isEstimatedCount: 0,
      primaryBehaviors: data.primaryBehaviors ?? null,
      secondaryBehaviors: null,
      distanceFromWater: data.distanceFromWater ?? null,
      waterResourceType: data.waterResourceType ?? null,
      waterSalinity: null,
      waterOrigin: null,
      waterFlow: null,
      waterDepth: data.waterDepth ?? null,
      iceCoverage: null,
      humanDisturbance: null,
      temperature: null,
      weather: data.weather ?? null,
      wind: null,
      precipitation: null,
      notes: data.notes ?? null,
      photoUrl: data.photoUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    observations.push(row);
    persist();
    return clone(row);
  },

  async getObservationById(id: number): Promise<Observation | undefined> {
    const found = observations.find(o => o.id === id);
    return found ? clone(found) : undefined;
  },

  async listObservationsByLocationId(locationId: number): Promise<Observation[]> {
    return observations
      .filter(o => o.locationId === locationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  },

  async listObservationsByUserId(userId: number): Promise<Observation[]> {
    return observations
      .filter(o => o.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  },

  async listObservationsByGroupKey(groupKey: string): Promise<Observation[]> {
    return observations.filter(o => o.distanceFromWater === groupKey).map(clone);
  },
};
